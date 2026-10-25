import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { PrismaUserRepository, prisma } from "../src/modules/auth/prisma-user-repository.js";
import { PrismaVehicleRepository } from "../src/modules/vehicles/prisma-vehicle-repository.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1" && Boolean(process.env.TEST_ADMIN_EMAIL);
const email = `phase3-${randomUUID()}@example.com`;
let vehicleId: string | undefined;

afterAll(async () => {
  if (runDatabaseTests) {
    if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
});

describe.skipIf(!runDatabaseTests)("vehicles with PostgreSQL", () => {
  it("persists admin CRUD and blocks a regular user", async () => {
    const app = createApp({
      users: new PrismaUserRepository(),
      vehicles: new PrismaVehicleRepository(),
      jwtSecret: "integration-test-secret-at-least-thirty-two-characters",
    });
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    });
    expect(adminLogin.status).toBe(200);
    const adminBearer = `Bearer ${adminLogin.body.accessToken}`;

    const created = await request(app).post("/api/vehicles").set("Authorization", adminBearer).send({
      make: "Toyota", model: "Corolla", category: "Sedan", price: "1250000.00", quantity: 0,
    });
    expect(created.status).toBe(201);
    vehicleId = created.body.vehicle.id;
    expect((await prisma.vehicle.findUnique({ where: { id: vehicleId! } }))?.price.toFixed(2)).toBe("1250000.00");

    const registration = await request(app).post("/api/auth/register").send({ name: "Regular User", email, password: "StrongPass123!" });
    expect(registration.status).toBe(201);
    const userLogin = await request(app).post("/api/auth/login").send({ email, password: "StrongPass123!" });
    const userBearer = `Bearer ${userLogin.body.accessToken}`;
    const list = await request(app).get("/api/vehicles").set("Authorization", userBearer);
    expect(list.status).toBe(200);
    expect(list.body.vehicles).toContainEqual(expect.objectContaining({ id: vehicleId, quantity: 0 }));
    expect((await request(app).delete(`/api/vehicles/${vehicleId}`).set("Authorization", userBearer)).status).toBe(403);

    const updated = await request(app).put(`/api/vehicles/${vehicleId}`).set("Authorization", adminBearer).send({
      make: "Toyota", model: "Corolla Hybrid", category: "Sedan", price: "1300000.50",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.vehicle.quantity).toBe(0);
    expect((await prisma.vehicle.findUnique({ where: { id: vehicleId! } }))?.model).toBe("Corolla Hybrid");
    expect((await request(app).delete(`/api/vehicles/${vehicleId}`).set("Authorization", adminBearer)).status).toBe(204);
    expect(await prisma.vehicle.findUnique({ where: { id: vehicleId! } })).toBeNull();
  });

  it("enforces price and quantity constraints in PostgreSQL", async () => {
    const base = { make: "Honda", model: "Civic", category: "Sedan" };
    await expect(prisma.vehicle.create({ data: { ...base, price: "0.00", quantity: 1 } })).rejects.toThrow();
    await expect(prisma.vehicle.create({ data: { ...base, price: "100.00", quantity: -1 } })).rejects.toThrow();
  });
});
