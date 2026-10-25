import "dotenv/config";
import { hash } from "bcryptjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../modules/auth/prisma-user-repository.js";
import { parseAdminConfig } from "./admin-config.js";

export async function createAdmin(environment: NodeJS.ProcessEnv = process.env) {
  const config = parseAdminConfig(environment);

  const existing = await prisma.user.findUnique({ where: { email: config.ADMIN_EMAIL } });
  if (existing) throw new Error("An account with this email already exists; choose a different admin email.");
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await createAdmin();
  } finally {
    await prisma.$disconnect();
  }
}
