import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { PrismaUserRepository, prisma } from "../src/modules/auth/prisma-user-repository.js";
import { PrismaVehicleRepository } from "../src/modules/vehicles/prisma-vehicle-repository.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.TEST_ADMIN_EMAIL);
const category = `Search-${randomUUID()}`;
const app = createApp({
  users: new PrismaUserRepository(),
  vehicles: new PrismaVehicleRepository(),
  jwtSecret: "integration-test-secret-at-least-thirty-two-characters",
});
let bearer: string;

beforeAll(async () => {
  if (!runDatabaseTests) return;
  await prisma.vehicle.createMany({ data: [
    { make: "Toyota", model: "Corolla", category, price: "100.00", quantity: 2 },
    { make: "Toyota", model: "Camry", category, price: "200.00", quantity: 0 },
    { make: "Honda", model: "Civic", category, price: "150.00", quantity: 4 },
    { make: "Toyota", model: "Corolla Hybrid", category, price: "250.00", quantity: 1 },
  ] });
  const login = await request(app).post("/api/auth/login").send({
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  expect(login.status).toBe(200);
  bearer = `Bearer ${login.body.accessToken}`;
});

afterAll(async () => {
  if (!runDatabaseTests) return;
  await prisma.vehicle.deleteMany({ where: { category } });
  await prisma.$disconnect();
});

describe.skipIf(!runDatabaseTests)("vehicle search with PostgreSQL", () => {
  it("combines case-insensitive text, inclusive price, and stock filters", async () => {
    const response = await request(app).get("/api/vehicles/search").query({
      make: "toy", model: "COR", category: category.toUpperCase(),
      minPrice: "100", maxPrice: "250", inStock: "true", sort: "price_desc",
    }).set("Authorization", bearer);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.vehicles.map((vehicle: { price: string }) => vehicle.price)).toEqual(["250.00", "100.00"]);
  });

  it("finds sold-out vehicles and paginates a sorted result", async () => {
    const soldOut = await request(app).get("/api/vehicles/search").query({ category, inStock: "false" }).set("Authorization", bearer);
    expect(soldOut.status).toBe(200);
    expect(soldOut.body.vehicles).toEqual([expect.objectContaining({ model: "Camry", quantity: 0 })]);

    const page = await request(app).get("/api/vehicles/search").query({ category, sort: "price_asc", page: "2", pageSize: "1" }).set("Authorization", bearer);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ total: 4, page: 2, pageSize: 1, totalPages: 4 });
    expect(page.body.vehicles).toEqual([expect.objectContaining({ model: "Civic", price: "150.00" })]);
  });

  it("returns an empty page when filters have no matches", async () => {
    const response = await request(app).get("/api/vehicles/search").query({ category, minPrice: "1000" }).set("Authorization", bearer);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ vehicles: [], total: 0, totalPages: 0 });
  });
});
