import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { NewUser, StoredUser, UserRepository } from "../src/modules/auth/user-repository.js";
import type { NewVehicle, SearchQuery, StoredVehicle, VehicleRepository } from "../src/modules/vehicles/vehicle-repository.js";

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
  async update(id: string, input: Omit<NewVehicle, "quantity">) {
    const vehicle = await this.findById(id);
    if (!vehicle) return null;
    Object.assign(vehicle, input);
    return vehicle;
  }
  async delete(id: string) {
    const count = this.vehicles.length;
    this.vehicles = this.vehicles.filter((vehicle) => vehicle.id !== id);
    return this.vehicles.length !== count;
  }
  async purchase(id: string) {
    const vehicle = await this.findById(id);
    if (!vehicle) return { status: "NOT_FOUND" as const };
    if (vehicle.quantity === 0) return { status: "OUT_OF_STOCK" as const };
    vehicle.quantity -= 1;
    return { status: "SUCCESS" as const, vehicle: { ...vehicle } };
  }
  async restock(id: string, quantity: number) {
    const vehicle = await this.findById(id);
    if (!vehicle) return null;
    vehicle.quantity += quantity;
    return { ...vehicle };
  }
}

const secret = "vehicle-test-secret-at-least-thirty-two-characters";
const listing = { make: " Toyota ", model: " Corolla ", category: "Sedan", price: "1250000", quantity: 2 };
let users: MemoryUsers;
let vehicles: MemoryVehicles;

beforeEach(() => {
  users = new MemoryUsers();
  vehicles = new MemoryVehicles();
});

function api() { return createApp({ users, vehicles, jwtSecret: secret }); }

async function token(role: "USER" | "ADMIN") {
  const email = `${role.toLowerCase()}@example.com`;
  await request(api()).post("/api/auth/register").send({ name: "Test User", email, password: "StrongPass123!" });
  if (role === "ADMIN") users.promote(email);
  const login = await request(api()).post("/api/auth/login").send({ email, password: "StrongPass123!" });
  return login.body.accessToken as string;
}

describe("vehicle API", () => {
  it("requires login for catalogue access", async () => {
    expect((await request(api()).get("/api/vehicles")).status).toBe(401);
  });

  it("lets an admin create a listing and a user view it", async () => {
    const adminToken = await token("ADMIN");
    const created = await request(api()).post("/api/vehicles").set("Authorization", `Bearer ${adminToken}`).send(listing);
    expect(created.status).toBe(201);
    expect(created.body.vehicle).toMatchObject({ make: "Toyota", model: "Corolla", category: "Sedan", price: "1250000.00", quantity: 2 });

    const userToken = await token("USER");
    const list = await request(api()).get("/api/vehicles").set("Authorization", `Bearer ${userToken}`);
    expect(list.status).toBe(200);
    expect(list.body.vehicles).toHaveLength(1);
    const detail = await request(api()).get(`/api/vehicles/${created.body.vehicle.id}`).set("Authorization", `Bearer ${userToken}`);
    expect(detail.body.vehicle.id).toBe(created.body.vehicle.id);
  });

  it("rejects invalid vehicle data and stock changes through edit", async () => {
    const bearer = `Bearer ${await token("ADMIN")}`;
    expect((await request(api()).post("/api/vehicles").set("Authorization", bearer).send({ ...listing, price: "0" })).status).toBe(400);
    expect((await request(api()).post("/api/vehicles").set("Authorization", bearer).send({ ...listing, quantity: -1 })).status).toBe(400);
    const created = await request(api()).post("/api/vehicles").set("Authorization", bearer).send(listing);
    const changed = { make: "Toyota", model: "Corolla X", category: "Sedan", price: "1300000", quantity: 99 };
    expect((await request(api()).put(`/api/vehicles/${created.body.vehicle.id}`).set("Authorization", bearer).send(changed)).status).toBe(400);
  });

  it("prevents regular users from creating, editing, or deleting listings", async () => {
    const adminBearer = `Bearer ${await token("ADMIN")}`;
    const created = await request(api()).post("/api/vehicles").set("Authorization", adminBearer).send(listing);
    const userBearer = `Bearer ${await token("USER")}`;
    const id = created.body.vehicle.id;
    expect((await request(api()).post("/api/vehicles").set("Authorization", userBearer).send(listing)).status).toBe(403);
    expect((await request(api()).put(`/api/vehicles/${id}`).set("Authorization", userBearer).send({ make: "Honda", model: "Civic", category: "Sedan", price: "1000000" })).status).toBe(403);
    expect((await request(api()).delete(`/api/vehicles/${id}`).set("Authorization", userBearer)).status).toBe(403);
  });

  it("lets an admin edit details and delete a listing", async () => {
    const bearer = `Bearer ${await token("ADMIN")}`;
    const created = await request(api()).post("/api/vehicles").set("Authorization", bearer).send(listing);
    const id = created.body.vehicle.id;
    const updated = await request(api()).put(`/api/vehicles/${id}`).set("Authorization", bearer).send({ make: "Toyota", model: "Corolla Hybrid", category: "Sedan", price: "1400000.50" });
    expect(updated.status).toBe(200);
    expect(updated.body.vehicle).toMatchObject({ model: "Corolla Hybrid", price: "1400000.50", quantity: 2 });
    expect((await request(api()).delete(`/api/vehicles/${id}`).set("Authorization", bearer)).status).toBe(204);
    expect((await request(api()).get(`/api/vehicles/${id}`).set("Authorization", bearer)).status).toBe(404);
  });

  it("returns clear errors for invalid or missing IDs", async () => {
    const bearer = `Bearer ${await token("ADMIN")}`;
    expect((await request(api()).get("/api/vehicles/not-a-uuid").set("Authorization", bearer)).status).toBe(400);
    expect((await request(api()).put(`/api/vehicles/${randomUUID()}`).set("Authorization", bearer).send({ make: "Honda", model: "Civic", category: "Sedan", price: "1000000" })).status).toBe(404);
    expect((await request(api()).delete(`/api/vehicles/${randomUUID()}`).set("Authorization", bearer)).status).toBe(404);
  });
});
