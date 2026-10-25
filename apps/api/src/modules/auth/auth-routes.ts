import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { AuthError, AuthService } from "./auth-service.js";
import type { Role } from "./user-repository.js";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1),
});

function sendError(response: Parameters<RequestHandler>[1], status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message } });
}

export function authenticate(auth: AuthService): RequestHandler {
  return async (request, response, next) => {
    const match = /^Bearer (\S+)$/i.exec(request.header("authorization") ?? "");
    if (!match) return sendError(response, 401, "UNAUTHORIZED", "A valid access token is required.");
    try {
      response.locals.user = await auth.currentUser(match[1]);
      next();
    } catch {
      sendError(response, 401, "UNAUTHORIZED", "A valid access token is required.");
    }
  };
}

export function requireRole(role: Role): RequestHandler {
  return (_request, response, next) => {
    if (response.locals.user?.role !== role) return sendError(response, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    next();
  };
}

export function authRoutes(auth: AuthService) {
  const router = Router();

  router.post("/register", async (request, response) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return sendError(response, 400, "VALIDATION_ERROR", "Registration details are invalid.");
    try {
      response.status(201).json({ user: await auth.register(parsed.data) });
    } catch (error) {
      if (error instanceof AuthError && error.code === "DUPLICATE_EMAIL") return sendError(response, 409, "DUPLICATE_EMAIL", "An account with this email already exists.");
      throw error;
    }
  });

  router.post("/login", async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return sendError(response, 400, "VALIDATION_ERROR", "Login details are invalid.");
    try {
      response.status(200).json(await auth.login(parsed.data));
    } catch (error) {
      if (error instanceof AuthError && error.code === "INVALID_CREDENTIALS") return sendError(response, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      throw error;
    }
  });

  router.get("/me", authenticate(auth), (_request, response) => {
    response.status(200).json({ user: response.locals.user });
  });

  return router;
}
