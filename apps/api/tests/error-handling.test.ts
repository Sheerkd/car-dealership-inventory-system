import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { UserRepository } from "../src/modules/auth/user-repository.js";

const secret = "quality-test-secret-at-least-thirty-two-characters";

describe("API error responses", () => {
  it("returns JSON for an unknown API route", async () => {
    const response = await request(createApp()).get("/api/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "API route not found." } });
  });

  it("hides unexpected repository errors behind a JSON response", async () => {
    const users: UserRepository = {
      findByEmail: async () => { throw new Error("private database connection details"); },
      findById: async () => null,
      create: async () => { throw new Error("not used"); },
    };
    const response = await request(createApp({ users, jwtSecret: secret }))
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "StrongPass123!" });

    expect(response.status).toBe(500);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
    expect(response.text).not.toContain("private database connection details");
  });

  it("reports malformed JSON as a client error", async () => {
    const response = await request(createApp())
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } });
  });
});
