import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { NewUser, StoredUser, UserRepository } from "../src/modules/auth/user-repository.js";
import type { NewVehicle, SearchQuery, StoredVehicle, VehicleDetails, VehicleRepository } from "../src/modules/vehicles/vehicle-repository.js";

class MemoryUsers implements UserRepository {
  private users: StoredUser[] = [];
  async findByEmail(email: string) { return this.users.find((user) => user.email === email) ?? null; }
  async findById(id: string) { return this.users.find((user) => user.id === id) ?? null; }
  async create(input: NewUser) {
    const user: StoredUser = { id: randomUUID(), role: "USER", ...input };
    this.users.push(user);
    return user;
  }
  promote(email: string) {
    const user = this.users.find((candidate) => candidate.email === email);
    if (user) user.role = "ADMIN";
  }
}

class MemoryVehicles implements VehicleRepository {
  private vehicles: StoredVehicle[] = [];
  async list() { return [...this.vehicles]; }
  async search(_query: SearchQuery) { return { vehicles: [...this.vehicles], total: this.vehicles.length }; }
  async findById(id: string) { return this.vehicles.find((vehicle) => vehicle.id === id) ?? null; }
  async create(input: NewVehicle) {
    const vehicle: StoredVehicle = { id: randomUUID(), ...input };
    this.vehicles.push(vehicle);
    return vehicle;
  }
  async update(id: string, input: VehicleDetails) {
    const vehicle = await this.findById(id);
    if (!vehicle) return null;
    Object.assign(vehicle, input);
    return vehicle;
  }
  async delete(id: string) {
    const previous = this.vehicles.length;
    this.vehicles = this.vehicles.filter((vehicle) => vehicle.id !== id);
    return this.vehicles.length < previous;
  }
  async purchase(id: string): Promise<{ status: "SUCCESS"; vehicle: StoredVehicle } | { status: "NOT_FOUND" | "OUT_OF_STOCK" }> {
    const vehicle = await this.findById(id);
    if (!vehicle) return { status: "NOT_FOUND" };
    if (vehicle.quantity === 0) return { status: "OUT_OF_STOCK" };
    vehicle.quantity -= 1;
    return { status: "SUCCESS", vehicle: { ...vehicle } };
  }
  async restock(id: string, quantity: number) {
    const vehicle = await this.findById(id);
    if (!vehicle) return null;
    if (vehicle.quantity + quantity > 1_000_000) return "LIMIT_EXCEEDED" as const;
    vehicle.quantity += quantity;
    return { ...vehicle };
  }
}

const vehicle = { make: "Toyota", model: "Corolla", category: "Sedan", price: "1250000.00" };
const secret = "inventory-test-secret-at-least-thirty-two-characters";
let users: MemoryUsers;
let vehicles: MemoryVehicles;

beforeEach(() => {
  users = new MemoryUsers();
  vehicles = new MemoryVehicles();
});

function api() { return createApp({ users, vehicles, jwtSecret: secret }); }

async function bearer(role: "USER" | "ADMIN") {
  const email = `${role.toLowerCase()}@example.com`;
  await request(api()).post("/api/auth/register").send({ name: "Inventory Tester", email, password: "StrongPass123!" });
  if (role === "ADMIN") users.promote(email);
  const login = await request(api()).post("/api/auth/login").send({ email, password: "StrongPass123!" });
  return `Bearer ${login.body.accessToken}`;
}

describe("inventory API", () => {
  it("requires authentication for purchase and restock", async () => {
    const listed = await vehicles.create({ ...vehicle, quantity: 1 });
    expect((await request(api()).post(`/api/vehicles/${listed.id}/purchase`)).status).toBe(401);
    expect((await request(api()).post(`/api/vehicles/${listed.id}/restock`).send({ quantity: 2 })).status).toBe(401);
    expect((await vehicles.findById(listed.id))?.quantity).toBe(1);
  });

  it("purchases exactly one unit and rejects another purchase when stock reaches zero", async () => {
    const listed = await vehicles.create({ ...vehicle, quantity: 1 });
    const token = await bearer("USER");

    const purchased = await request(api()).post(`/api/vehicles/${listed.id}/purchase`).set("Authorization", token);
    expect(purchased.status).toBe(200);
    expect(purchased.body.vehicle).toMatchObject({ id: listed.id, quantity: 0 });
    expect((await vehicles.findById(listed.id))?.quantity).toBe(0);

    const soldOut = await request(api()).post(`/api/vehicles/${listed.id}/purchase`).set("Authorization", token);
    expect(soldOut.status).toBe(409);
    expect(soldOut.body.error.code).toBe("OUT_OF_STOCK");
    expect((await vehicles.findById(listed.id))?.quantity).toBe(0);
  });

  it("does not accept an arbitrary purchase quantity", async () => {
    const listed = await vehicles.create({ ...vehicle, quantity: 3 });
    const response = await request(api()).post(`/api/vehicles/${listed.id}/purchase`).set("Authorization", await bearer("USER")).send({ quantity: 2 });
    expect(response.status).toBe(400);
    expect((await vehicles.findById(listed.id))?.quantity).toBe(3);
  });

  it("allows admins to restock a sold-out listing and rejects regular users", async () => {
    const listed = await vehicles.create({ ...vehicle, quantity: 0 });
    const userToken = await bearer("USER");
    expect((await request(api()).post(`/api/vehicles/${listed.id}/restock`).set("Authorization", userToken).send({ quantity: 3 })).status).toBe(403);

    const adminToken = await bearer("ADMIN");
    const restocked = await request(api()).post(`/api/vehicles/${listed.id}/restock`).set("Authorization", adminToken).send({ quantity: 3 });
    expect(restocked.status).toBe(200);
    expect(restocked.body.vehicle).toMatchObject({ id: listed.id, quantity: 3 });
    expect((await vehicles.findById(listed.id))?.quantity).toBe(3);
  });

  it("does not let a restock raise stock above the listing limit", async () => {
    const listed = await vehicles.create({ ...vehicle, quantity: 999_999 });
    const token = await bearer("ADMIN");
    const url = `/api/vehicles/${listed.id}/restock`;

    const rejected = await request(api()).post(url).set("Authorization", token).send({ quantity: 2 });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("STOCK_LIMIT_EXCEEDED");
    expect((await vehicles.findById(listed.id))?.quantity).toBe(999_999);

    const accepted = await request(api()).post(url).set("Authorization", token).send({ quantity: 1 });
    expect(accepted.status).toBe(200);
    expect(accepted.body.vehicle.quantity).toBe(1_000_000);
  });

  it("rejects invalid restock amounts without changing stock", async () => {
    const listed = await vehicles.create({ ...vehicle, quantity: 2 });
    const token = await bearer("ADMIN");
    for (const body of [{}, { quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: "2" }, { quantity: 2, extra: true }]) {
      const response = await request(api()).post(`/api/vehicles/${listed.id}/restock`).set("Authorization", token).send(body);
      expect(response.status).toBe(400);
    }
    expect((await vehicles.findById(listed.id))?.quantity).toBe(2);
  });

  it("distinguishes invalid IDs from missing vehicles", async () => {
    const userToken = await bearer("USER");
    const adminToken = await bearer("ADMIN");
    const missing = randomUUID();
    expect((await request(api()).post("/api/vehicles/not-a-uuid/purchase").set("Authorization", userToken)).status).toBe(400);
    expect((await request(api()).post(`/api/vehicles/${missing}/purchase`).set("Authorization", userToken)).status).toBe(404);
    expect((await request(api()).post("/api/vehicles/not-a-uuid/restock").set("Authorization", adminToken).send({ quantity: 1 })).status).toBe(400);
    expect((await request(api()).post(`/api/vehicles/${missing}/restock`).set("Authorization", adminToken).send({ quantity: 1 })).status).toBe(404);
  });
});
