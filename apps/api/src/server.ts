import "dotenv/config";
import { createApp } from "./app.js";
import { PrismaUserRepository } from "./modules/auth/prisma-user-repository.js";
import { PrismaVehicleRepository } from "./modules/vehicles/prisma-vehicle-repository.js";

const port = Number(process.env.PORT ?? 3001);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

createApp({ users: new PrismaUserRepository(), vehicles: new PrismaVehicleRepository(), jwtSecret }).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
