import { PrismaClient } from "@prisma/client";
import type { NewUser, UserRepository } from "./user-repository.js";

export const prisma = new PrismaClient();

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async create(input: NewUser) {
    return prisma.user.create({ data: input });
  }
}
