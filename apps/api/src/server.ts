import "dotenv/config";
import { createApp } from "./app.js";
import { PrismaUserRepository } from "./modules/auth/prisma-user-repository.js";
import { PrismaVehicleRepository } from "./modules/vehicles/prisma-vehicle-repository.js";
import { fileURLToPath } from "node:url";
import { mountStaticWeb } from "./static-web.js";

const port = Number(process.env.PORT ?? 3001);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const app = createApp({ users: new PrismaUserRepository(), vehicles: new PrismaVehicleRepository(), jwtSecret });
if (process.env.SERVE_WEB === "true") {
  mountStaticWeb(app, fileURLToPath(new URL("../../web/dist/", import.meta.url)));
}
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
