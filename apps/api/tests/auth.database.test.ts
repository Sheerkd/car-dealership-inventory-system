import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { PrismaUserRepository, prisma } from "../src/modules/auth/prisma-user-repository.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const email = `phase2-${randomUUID()}@example.com`;

afterAll(async () => {
  if (runDatabaseTests) {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
});

describe.skipIf(!runDatabaseTests)("authentication with PostgreSQL", () => {
  it("persists registration and permits login through a fresh repository", async () => {
    const app = createApp({ users: new PrismaUserRepository(), jwtSecret: "integration-test-secret-at-least-thirty-two-characters" });
    const registration = await request(app).post("/api/auth/register").send({ name: "Database Tester", email, password: "StrongPass123!" });
    expect(registration.status).toBe(201);

    const saved = await prisma.user.findUnique({ where: { email } });
    expect(saved?.role).toBe("USER");
    expect(saved?.passwordHash).not.toBe("StrongPass123!");

    const login = await request(app).post("/api/auth/login").send({ email, password: "StrongPass123!" });
    expect(login.status).toBe(200);
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.body.user.email).toBe(email);
  });

  it.skipIf(!process.env.TEST_ADMIN_EMAIL)("logs in a provisioned admin account", async () => {
    const app = createApp({ users: new PrismaUserRepository(), jwtSecret: "integration-test-secret-at-least-thirty-two-characters" });
    const login = await request(app).post("/api/auth/login").send({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("ADMIN");
  });
});
