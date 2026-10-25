import request from "supertest";
import { describe, expect, it } from "vitest";

const base = {
  DATABASE_URL: "postgresql://dealership:dealership@localhost:5432/dealership",
  JWT_SECRET: "startup-test-secret-at-least-thirty-two-characters",
};

describe("API startup", () => {
  it("rejects missing connection settings and an invalid port", async () => {
    const { createServer } = await import("../src/server.js");
    expect(() => createServer({ DATABASE_URL: base.DATABASE_URL })).toThrow("JWT_SECRET is required");
    expect(() => createServer({ JWT_SECRET: base.JWT_SECRET })).toThrow("DATABASE_URL is required");
    expect(() => createServer({ ...base, PORT: "invalid" })).toThrow("PORT must be between 1 and 65535");
  });

  it("mounts the API for both API-only and combined web hosting", async () => {
    const { createServer } = await import("../src/server.js");
    for (const serveWeb of ["false", "true"]) {
      const { app, port } = createServer({ ...base, PORT: "4312", SERVE_WEB: serveWeb });
      expect(port).toBe(4312);
      expect((await request(app).get("/api/health")).body).toEqual({ status: "ok" });
      expect((await request(app).get("/api/vehicles")).status).toBe(401);
    }
  });
});

describe("admin setup configuration", () => {
  it("normalizes the email and requires a sufficiently long password", async () => {
    const { parseAdminConfig } = await import("../src/scripts/admin-config.js");
    expect(parseAdminConfig({ ADMIN_NAME: "Coverage Admin", ADMIN_EMAIL: "  ADMIN@EXAMPLE.COM ", ADMIN_PASSWORD: "StrongPassword123!" }).ADMIN_EMAIL)
      .toBe("admin@example.com");
    expect(() => parseAdminConfig({ ADMIN_NAME: "Coverage Admin", ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "short" }))
      .toThrow();
  });
});
