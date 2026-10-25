import request from "supertest";
import express from "express";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AuthService } from "../src/modules/auth/auth-service.js";
import { authenticate, requireRole } from "../src/modules/auth/auth-routes.js";
import type { NewUser, StoredUser, UserRepository } from "../src/modules/auth/user-repository.js";

class MemoryUsers implements UserRepository {
  private users: StoredUser[] = [];

  async findByEmail(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(id: string) {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async create(input: NewUser) {
    if (await this.findByEmail(input.email)) throw new Error("DUPLICATE_EMAIL");
    const user: StoredUser = { id: crypto.randomUUID(), role: "USER", ...input };
    this.users.push(user);
    return user;
  }

  promote(email: string) {
    const user = this.users.find((candidate) => candidate.email === email);
    if (user) user.role = "ADMIN";
  }
}

const validUser = { name: "Asha Kumar", email: "Asha@Example.com", password: "StrongPass123!" };
let users: MemoryUsers;

beforeEach(() => {
  users = new MemoryUsers();
});

function api() {
  return createApp({ users, jwtSecret: "test-secret-at-least-thirty-two-characters" });
}

describe("authentication API", () => {
  it("registers a regular user with normalized email and no exposed password", async () => {
    const response = await request(api()).post("/api/auth/register").send({ ...validUser, role: "ADMIN" });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ name: validUser.name, email: "asha@example.com", role: "USER" });
    expect(response.body.user.password).toBeUndefined();
    expect(response.body.user.passwordHash).toBeUndefined();
    expect((await users.findByEmail("asha@example.com"))?.passwordHash).not.toBe(validUser.password);
  });

  it("rejects invalid registration data and duplicate email", async () => {
    expect((await request(api()).post("/api/auth/register").send({ ...validUser, password: "short" })).status).toBe(400);
    expect((await request(api()).post("/api/auth/register").send(validUser)).status).toBe(201);
    expect((await request(api()).post("/api/auth/register").send({ ...validUser, email: "  ASHA@example.com " })).status).toBe(409);
  });

  it("logs in and identifies the user with a bearer token", async () => {
    await request(api()).post("/api/auth/register").send(validUser);
    const login = await request(api()).post("/api/auth/login").send({ email: "ASHA@example.com", password: validUser.password });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    const me = await request(api()).get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: "asha@example.com", role: "USER" });
  });

  it("rejects wrong passwords and invalid or missing tokens", async () => {
    await request(api()).post("/api/auth/register").send(validUser);
    expect((await request(api()).post("/api/auth/login").send({ email: validUser.email, password: "wrong" })).status).toBe(401);
    expect((await request(api()).get("/api/auth/me")).status).toBe(401);
    expect((await request(api()).get("/api/auth/me").set("Authorization", "Bearer invalid" )).status).toBe(401);
  });

  it("checks the current database role for admin operations", async () => {
    await request(api()).post("/api/auth/register").send(validUser);
    const login = await request(api()).post("/api/auth/login").send({ email: validUser.email, password: validUser.password });
    const protectedApp = express();
    protectedApp.get(
      "/admin",
      authenticate(new AuthService(users, "test-secret-at-least-thirty-two-characters")),
      requireRole("ADMIN"),
      (_request, response) => response.json({ allowed: true }),
    );

    const bearer = `Bearer ${login.body.accessToken}`;
    expect((await request(protectedApp).get("/admin").set("Authorization", bearer)).status).toBe(403);
    users.promote("asha@example.com");
    expect((await request(protectedApp).get("/admin").set("Authorization", bearer)).status).toBe(200);
  });
});
