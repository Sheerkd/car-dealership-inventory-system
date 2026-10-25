import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { PrismaUserRepository, prisma } from "../src/modules/auth/prisma-user-repository.js";
import { PrismaVehicleRepository } from "../src/modules/vehicles/prisma-vehicle-repository.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.TEST_ADMIN_EMAIL);
const email = `phase5-${randomUUID()}@example.com`;
const createdIds: string[] = [];
const app = createApp({
  users: new PrismaUserRepository(),
  vehicles: new PrismaVehicleRepository(),
  jwtSecret: "integration-test-secret-at-least-thirty-two-characters",
});
let userBearer: string;
let adminBearer: string;

beforeAll(async () => {
  if (!runDatabaseTests) return;
  const registration = await request(app).post("/api/auth/register").send({
    name: "Inventory Tester", email, password: "StrongPass123!",
  });
  expect(registration.status).toBe(201);
  const userLogin = await request(app).post("/api/auth/login").send({ email, password: "StrongPass123!" });
  expect(userLogin.status).toBe(200);
  userBearer = `Bearer ${userLogin.body.accessToken}`;

  const adminLogin = await request(app).post("/api/auth/login").send({
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  });
  expect(adminLogin.status).toBe(200);
  adminBearer = `Bearer ${adminLogin.body.accessToken}`;
});

afterAll(async () => {
  if (!runDatabaseTests) return;
  await prisma.vehicle.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

async function vehicleWithStock(quantity: number) {
  const vehicle = await prisma.vehicle.create({
    data: { make: "Toyota", model: "Corolla", category: "Inventory Test", price: "1250000.00", quantity },
  });
  createdIds.push(vehicle.id);
  return vehicle.id;
}

describe.skipIf(!runDatabaseTests)("inventory with PostgreSQL", () => {
  it("allows exactly one of two buyers to purchase the final unit", async () => {
    const id = await vehicleWithStock(1);
    const purchase = () => request(app).post(`/api/vehicles/${id}/purchase`).set("Authorization", userBearer);

    const [first, second] = await Promise.all([purchase(), purchase()]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const winner = first.status === 200 ? first : second;
    expect(winner.body.vehicle.quantity).toBe(0);
    expect((await prisma.vehicle.findUnique({ where: { id } }))?.quantity).toBe(0);
    expect((await purchase()).status).toBe(409);
  });

  it("restricts restocking to admins and persists the new quantity", async () => {
    const id = await vehicleWithStock(0);
    const restockUrl = `/api/vehicles/${id}/restock`;

    expect((await request(app).post(restockUrl).set("Authorization", userBearer).send({ quantity: 3 })).status).toBe(403);
    const restock = await request(app).post(restockUrl).set("Authorization", adminBearer).send({ quantity: 3 });
    expect(restock.status).toBe(200);
    expect(restock.body.vehicle.quantity).toBe(3);
    expect((await prisma.vehicle.findUnique({ where: { id } }))?.quantity).toBe(3);

    const purchase = await request(app).post(`/api/vehicles/${id}/purchase`).set("Authorization", userBearer);
    expect(purchase.status).toBe(200);
    expect(purchase.body.vehicle.quantity).toBe(2);
    expect((await prisma.vehicle.findUnique({ where: { id } }))?.quantity).toBe(2);
  });
});
