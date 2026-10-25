import "dotenv/config";
import { hash } from "bcryptjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../modules/auth/prisma-user-repository.js";
import { parseAdminConfig } from "./admin-config.js";

export async function bootstrapAdmin(environment: NodeJS.ProcessEnv = process.env) {
  const config = parseAdminConfig(environment);

  const existing = await prisma.user.findUnique({ where: { email: config.ADMIN_EMAIL } });
  if (existing) {
    if (existing.role !== "ADMIN") throw new Error("Configured admin email belongs to a regular user.");
    console.log(`Admin account already exists for ${config.ADMIN_EMAIL}`);
  } else {
    await prisma.user.create({
      data: {
        name: config.ADMIN_NAME,
        email: config.ADMIN_EMAIL,
        passwordHash: await hash(config.ADMIN_PASSWORD, 12),
        role: "ADMIN",
      },
    });
    console.log(`Admin account created for ${config.ADMIN_EMAIL}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await bootstrapAdmin();
  } finally {
    await prisma.$disconnect();
  }
}
