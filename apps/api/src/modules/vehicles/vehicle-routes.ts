import { Router } from "express";
import { z } from "zod";
import { AuthService } from "../auth/auth-service.js";
import { authenticate, requireRole } from "../auth/auth-routes.js";
import type { VehicleRepository } from "./vehicle-repository.js";

const textField = z.string().trim().min(1).max(80);
const priceField = z.string().trim()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
  .refine((value) => /[1-9]/.test(value))
  .transform((value) => {
    const [whole, cents = ""] = value.split(".");
    return `${whole}.${cents.padEnd(2, "0")}`;
  });

const detailsSchema = z.strictObject({
  make: textField,
  model: textField,
  category: textField,
  price: priceField,
});
const createSchema = detailsSchema.extend({ quantity: z.number().int().min(0).max(1_000_000) });
const idSchema = z.uuid();
const purchaseSchema = z.strictObject({});
const restockSchema = z.strictObject({ quantity: z.number().int().min(1).max(1_000_000) });
const searchText = z.string().trim().min(1).max(80).optional();
const searchPrice = z.string().trim()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [whole, cents = ""] = value.split(".");
    return `${whole}.${cents.padEnd(2, "0")}`;
  }).optional();
const positivePage = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(1_000_000)).optional();
const pageSize = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(100)).optional();
const searchSchema = z.strictObject({
  make: searchText,
  model: searchText,
  category: searchText,
  minPrice: searchPrice,
  maxPrice: searchPrice,
  inStock: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: positivePage,
  pageSize,
  sort: z.enum(["newest", "price_asc", "price_desc"]).optional(),
});

function cents(value: string) {
  const [whole, fraction] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction);
}

function error(response: { status: (status: number) => { json: (body: object) => unknown } }, status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message } });
}

export function vehicleRoutes(auth: AuthService, vehicles: VehicleRepository) {
  const router = Router();
  router.use(authenticate(auth));

  router.get("/", async (_request, response) => {
    response.status(200).json({ vehicles: await vehicles.list() });
  });

  router.post("/", requireRole("ADMIN"), async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return error(response, 400, "VALIDATION_ERROR", "Vehicle details are invalid.");
    response.status(201).json({ vehicle: await vehicles.create(parsed.data) });
  });

  router.get("/search", async (request, response) => {
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) return error(response, 400, "VALIDATION_ERROR", "Search filters are invalid.");
    const filters = parsed.data;
    if (filters.minPrice && filters.maxPrice && cents(filters.minPrice) > cents(filters.maxPrice)) {
      return error(response, 400, "VALIDATION_ERROR", "Minimum price cannot exceed maximum price.");
    }
    const page = filters.page ?? 1;
    const size = filters.pageSize ?? 12;
    const result = await vehicles.search({ ...filters, page, pageSize: size, sort: filters.sort ?? "newest" });
    response.status(200).json({ ...result, page, pageSize: size, totalPages: Math.ceil(result.total / size) });
  });

  router.post("/:id/purchase", async (request, response) => {
    const id = idSchema.safeParse(request.params.id);
    const body = purchaseSchema.safeParse(request.body ?? {});
    if (!id.success || !body.success) return error(response, 400, "VALIDATION_ERROR", "Purchase request is invalid.");
    const result = await vehicles.purchase(id.data);
    if (result.status === "NOT_FOUND") return error(response, 404, "NOT_FOUND", "Vehicle not found.");
    if (result.status === "OUT_OF_STOCK") return error(response, 409, "OUT_OF_STOCK", "This vehicle is out of stock.");
    response.status(200).json({ vehicle: result.vehicle });
  });

  router.post("/:id/restock", requireRole("ADMIN"), async (request, response) => {
    const id = idSchema.safeParse(request.params.id);
    const body = restockSchema.safeParse(request.body);
    if (!id.success || !body.success) return error(response, 400, "VALIDATION_ERROR", "Restock request is invalid.");
    const vehicle = await vehicles.restock(id.data, body.data.quantity);
    if (vehicle === "LIMIT_EXCEEDED") return error(response, 400, "STOCK_LIMIT_EXCEEDED", "Vehicle stock cannot exceed 1,000,000 units.");
    if (!vehicle) return error(response, 404, "NOT_FOUND", "Vehicle not found.");
    response.status(200).json({ vehicle });
  });

  router.get("/:id", async (request, response) => {
    const parsed = idSchema.safeParse(request.params.id);
    if (!parsed.success) return error(response, 400, "VALIDATION_ERROR", "Vehicle ID is invalid.");
    const vehicle = await vehicles.findById(parsed.data);
    if (!vehicle) return error(response, 404, "NOT_FOUND", "Vehicle not found.");
    response.status(200).json({ vehicle });
  });

  router.put("/:id", requireRole("ADMIN"), async (request, response) => {
    const id = idSchema.safeParse(request.params.id);
    const body = detailsSchema.safeParse(request.body);
    if (!id.success || !body.success) return error(response, 400, "VALIDATION_ERROR", "Vehicle details are invalid.");
    const vehicle = await vehicles.update(id.data, body.data);
    if (!vehicle) return error(response, 404, "NOT_FOUND", "Vehicle not found.");
    response.status(200).json({ vehicle });
  });

  router.delete("/:id", requireRole("ADMIN"), async (request, response) => {
    const parsed = idSchema.safeParse(request.params.id);
    if (!parsed.success) return error(response, 400, "VALIDATION_ERROR", "Vehicle ID is invalid.");
    if (!(await vehicles.delete(parsed.data))) return error(response, 404, "NOT_FOUND", "Vehicle not found.");
    response.status(204).send();
  });

  return router;
}
