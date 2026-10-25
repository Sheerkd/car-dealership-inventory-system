import { Prisma, type Vehicle } from "@prisma/client";
import { prisma } from "../auth/prisma-user-repository.js";
import type { NewVehicle, PurchaseResult, SearchQuery, StoredVehicle, VehicleDetails, VehicleRepository } from "./vehicle-repository.js";

function toStoredVehicle(vehicle: Vehicle): StoredVehicle {
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    category: vehicle.category,
    price: vehicle.price.toFixed(2),
    quantity: vehicle.quantity,
  };
}

export class PrismaVehicleRepository implements VehicleRepository {
  async list() {
    const vehicles = await prisma.vehicle.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return vehicles.map(toStoredVehicle);
  }

  async search(query: SearchQuery) {
    const where: Prisma.VehicleWhereInput = {
      ...(query.make && { make: { contains: query.make, mode: "insensitive" } }),
      ...(query.model && { model: { contains: query.model, mode: "insensitive" } }),
      ...(query.category && { category: { contains: query.category, mode: "insensitive" } }),
      ...((query.minPrice || query.maxPrice) && {
        price: {
          ...(query.minPrice && { gte: query.minPrice }),
          ...(query.maxPrice && { lte: query.maxPrice }),
        },
      }),
      ...(query.inStock !== undefined && { quantity: query.inStock ? { gt: 0 } : { equals: 0 } }),
    };
    const orderBy: Prisma.VehicleOrderByWithRelationInput[] = query.sort === "newest"
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : query.sort === "price_asc"
        ? [{ price: "asc" }, { id: "asc" }]
        : [{ price: "desc" }, { id: "desc" }];

    const [vehicles, total] = await prisma.$transaction([
      prisma.vehicle.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.vehicle.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    return { vehicles: vehicles.map(toStoredVehicle), total };
  }

  async findById(id: string) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    return vehicle ? toStoredVehicle(vehicle) : null;
  }

  async create(input: NewVehicle) {
    return toStoredVehicle(await prisma.vehicle.create({ data: input }));
  }

  async update(id: string, input: VehicleDetails) {
    try {
      return toStoredVehicle(await prisma.vehicle.update({ where: { id }, data: input }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }

  async delete(id: string) {
    return (await prisma.vehicle.deleteMany({ where: { id } })).count > 0;
  }

  async purchase(id: string): Promise<PurchaseResult> {
    return prisma.$transaction(async (transaction) => {
      const changed = await transaction.vehicle.updateMany({
        where: { id, quantity: { gt: 0 } },
        data: { quantity: { decrement: 1 } },
      });
      const vehicle = await transaction.vehicle.findUnique({ where: { id } });
      if (!vehicle) return { status: "NOT_FOUND" };
      if (changed.count === 0) return { status: "OUT_OF_STOCK" };
      return { status: "SUCCESS", vehicle: toStoredVehicle(vehicle) };
    });
  }

  async restock(id: string, quantity: number) {
    try {
      const vehicle = await prisma.vehicle.update({
        where: { id },
        data: { quantity: { increment: quantity } },
      });
      return toStoredVehicle(vehicle);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }
}
