import "dotenv/config";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "../modules/auth/prisma-user-repository.js";

const config = z.object({
  ADMIN_NAME: z.string().trim().min(2),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  ADMIN_PASSWORD: z.string().min(12),
}).parse(process.env);

try {
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
} finally {
  await prisma.$disconnect();
}
