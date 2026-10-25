import "dotenv/config";
import { createApp } from "./app.js";
import { PrismaUserRepository } from "./modules/auth/prisma-user-repository.js";
import { PrismaVehicleRepository } from "./modules/vehicles/prisma-vehicle-repository.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { mountStaticWeb } from "./static-web.js";

export function createServer(environment: NodeJS.ProcessEnv = process.env) {
  const port = Number(environment.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
  const jwtSecret = environment.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET is required");
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const app = createApp({ users: new PrismaUserRepository(), vehicles: new PrismaVehicleRepository(), jwtSecret });
  if (environment.SERVE_WEB === "true") {
    mountStaticWeb(app, fileURLToPath(new URL("../../web/dist/", import.meta.url)));
  }
  return { app, port };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, port } = createServer();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}
