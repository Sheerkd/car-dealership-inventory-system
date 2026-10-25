import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/modules/auth/prisma-user-repository.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const bootstrapEmail = `bootstrap-${randomUUID()}@example.test`;
const manualEmail = `manual-${randomUUID()}@example.test`;
const collisionEmail = `collision-${randomUUID()}@example.test`;
const password = "AdminCoveragePassword123!";

afterAll(async () => {
  if (!runDatabaseTests) return;
  await prisma.user.deleteMany({ where: { email: { in: [bootstrapEmail, manualEmail, collisionEmail] } } });
  await prisma.$disconnect();
});

describe.skipIf(!runDatabaseTests)("admin setup with PostgreSQL", () => {
  it("creates the first admin and keeps its password on repeated bootstrap", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { bootstrapAdmin } = await import("../src/scripts/bootstrap-admin.js");
      await bootstrapAdmin({ ADMIN_NAME: "Coverage Admin", ADMIN_EMAIL: bootstrapEmail, ADMIN_PASSWORD: password });
      const first = await prisma.user.findUniqueOrThrow({ where: { email: bootstrapEmail } });
      expect(first.role).toBe("ADMIN");
      expect(await compare(password, first.passwordHash)).toBe(true);

      await bootstrapAdmin({ ADMIN_NAME: "Changed Name", ADMIN_EMAIL: bootstrapEmail, ADMIN_PASSWORD: "DifferentPassword123!" });
      const second = await prisma.user.findUniqueOrThrow({ where: { email: bootstrapEmail } });
      expect(second.id).toBe(first.id);
      expect(second.passwordHash).toBe(first.passwordHash);
    } finally {
      log.mockRestore();
    }
  });

  it("refuses to promote an existing regular account", async () => {
    await prisma.user.create({ data: {
      name: "Regular Account", email: collisionEmail, passwordHash: await hash(password, 12), role: "USER",
    } });
    const { bootstrapAdmin } = await import("../src/scripts/bootstrap-admin.js");
    await expect(bootstrapAdmin({ ADMIN_NAME: "Coverage Admin", ADMIN_EMAIL: collisionEmail, ADMIN_PASSWORD: password }))
      .rejects.toThrow("Configured admin email belongs to a regular user.");
    expect((await prisma.user.findUniqueOrThrow({ where: { email: collisionEmail } })).role).toBe("USER");
  });

  it("allows one manual admin creation and rejects a duplicate email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { createAdmin } = await import("../src/scripts/create-admin.js");
      const config = { ADMIN_NAME: "Manual Admin", ADMIN_EMAIL: manualEmail, ADMIN_PASSWORD: password };
      await createAdmin(config);
      expect((await prisma.user.findUniqueOrThrow({ where: { email: manualEmail } })).role).toBe("ADMIN");
      await expect(createAdmin(config)).rejects.toThrow("An account with this email already exists");
    } finally {
      log.mockRestore();
    }
  });
});
