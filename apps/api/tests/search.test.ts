import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { NewUser, StoredUser, UserRepository } from "../src/modules/auth/user-repository.js";
import type { NewVehicle, PurchaseResult, SearchQuery, SearchResult, StoredVehicle, VehicleDetails, VehicleRepository } from "../src/modules/vehicles/vehicle-repository.js";

class MemoryUsers implements UserRepository {
  private users: StoredUser[] = [];
  async findByEmail(email: string) { return this.users.find((user) => user.email === email) ?? null; }
  async findById(id: string) { return this.users.find((user) => user.id === id) ?? null; }
  async create(input: NewUser) {
    const user: StoredUser = { id: randomUUID(), role: "USER", ...input };
    this.users.push(user);
    return user;
  }
}

class SearchVehicles implements VehicleRepository {
  queries: SearchQuery[] = [];
  async list(): Promise<StoredVehicle[]> { return []; }
  async findById(_id: string): Promise<StoredVehicle | null> { return null; }
  async create(_input: NewVehicle): Promise<StoredVehicle> { throw new Error("not used"); }
  async update(_id: string, _input: VehicleDetails): Promise<StoredVehicle | null> { throw new Error("not used"); }
  async delete(_id: string): Promise<boolean> { throw new Error("not used"); }
  async purchase(_id: string): Promise<PurchaseResult> { throw new Error("not used"); }
  async restock(_id: string, _quantity: number): Promise<StoredVehicle | null> { throw new Error("not used"); }
  async search(query: SearchQuery): Promise<SearchResult> {
    this.queries.push(query);
    return { vehicles: [], total: 0 };
  }
}

let users: MemoryUsers;
let vehicles: SearchVehicles;

beforeEach(() => {
  users = new MemoryUsers();
  vehicles = new SearchVehicles();
});

function api() { return createApp({ users, vehicles, jwtSecret: "search-test-secret-at-least-thirty-two-characters" }); }

async function bearer() {
  await request(api()).post("/api/auth/register").send({ name: "Search User", email: "search@example.com", password: "StrongPass123!" });
  const login = await request(api()).post("/api/auth/login").send({ email: "search@example.com", password: "StrongPass123!" });
  return `Bearer ${login.body.accessToken}`;
}

describe("GET /api/vehicles/search", () => {
  it("requires authentication", async () => {
    expect((await request(api()).get("/api/vehicles/search")).status).toBe(401);
  });

  it("uses default pagination and returns an empty result", async () => {
    const response = await request(api()).get("/api/vehicles/search").set("Authorization", await bearer());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ vehicles: [], total: 0, page: 1, pageSize: 12, totalPages: 0 });
    expect(vehicles.queries).toEqual([{ page: 1, pageSize: 12, sort: "newest" }]);
  });

  it("normalizes combined filters and pagination", async () => {
    const response = await request(api())
      .get("/api/vehicles/search?make=%20Toy%20&model=cor&category=Sedan&minPrice=1000000&maxPrice=2000000.5&inStock=true&page=2&pageSize=5&sort=price_asc")
      .set("Authorization", await bearer());
    expect(response.status).toBe(200);
    expect(response.body.page).toBe(2);
    expect(vehicles.queries).toEqual([{
      make: "Toy", model: "cor", category: "Sedan", minPrice: "1000000.00", maxPrice: "2000000.50",
      inStock: true, page: 2, pageSize: 5, sort: "price_asc",
    }]);
  });

  it("rejects invalid ranges, pagination, and sort values", async () => {
    const token = await bearer();
    for (const query of ["minPrice=200&maxPrice=100", "minPrice=-1", "page=0", "page=1.5", "pageSize=101", "sort=unknown", "inStock=yes", "make=%20%20"]) {
      expect((await request(api()).get(`/api/vehicles/search?${query}`).set("Authorization", token)).status).toBe(400);
    }
    expect(vehicles.queries).toHaveLength(0);
  });
});
