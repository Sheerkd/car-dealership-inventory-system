import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { AuthService } from "./modules/auth/auth-service.js";
import { authRoutes } from "./modules/auth/auth-routes.js";
import type { UserRepository } from "./modules/auth/user-repository.js";
import { vehicleRoutes } from "./modules/vehicles/vehicle-routes.js";
import type { VehicleRepository } from "./modules/vehicles/vehicle-repository.js";

interface Dependencies {
  users: UserRepository;
  jwtSecret: string;
  vehicles?: VehicleRepository;
}

export function createApp(dependencies?: Dependencies) {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  if (dependencies) {
    const auth = new AuthService(dependencies.users, dependencies.jwtSecret);
    app.use("/api/auth", authRoutes(auth));
    if (dependencies.vehicles) app.use("/api/vehicles", vehicleRoutes(auth, dependencies.vehicles));
  }

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "API route not found." } });
  });

  const handleError: ErrorRequestHandler = (failure: unknown, _request, response, next) => {
    if (response.headersSent) return next(failure);
    const type = failure && typeof failure === "object" && "type" in failure ? failure.type : null;
    if (type === "entity.parse.failed") {
      response.status(400).json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } });
      return;
    }
    if (type === "entity.too.large") {
      response.status(413).json({ error: { code: "REQUEST_TOO_LARGE", message: "Request body is too large." } });
      return;
    }
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
  };
  app.use(handleError);

  return app;
}
