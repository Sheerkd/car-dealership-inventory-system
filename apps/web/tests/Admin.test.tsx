// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../src/App";

type Vehicle = { id: string; make: string; model: string; category: string; price: string; quantity: number };
type Request = { method: string; path: string; body: Record<string, unknown> | undefined; authorization: string | undefined };

const corolla: Vehicle = {
  id: "b2c7cc99-6381-4099-ad3e-259a630a85d8",
  make: "Toyota",
  model: "Corolla",
  category: "Sedan",
  price: "1250000.00",
  quantity: 1,
};
const civicId = "d02bcf30-ff4d-4e29-854b-9dc9239f83a2";

let vehicles: Vehicle[];
let requests: Request[];
let failCreate: boolean;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vehicles = [{ ...corolla }];
  requests = [];
  failCreate = false;

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, "http://localhost");
    const method = init?.method?.toUpperCase() ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    requests.push({ method, path: url.pathname, body, authorization: new Headers(init?.headers).get("Authorization") ?? undefined });

    if (url.pathname === "/api/auth/login" && method === "POST") {
      const admin = body?.email === "admin@example.com";
      return json({
        accessToken: admin ? "admin-token" : "user-token",
        tokenType: "Bearer",
        expiresIn: 900,
        user: { id: admin ? "admin-1" : "user-1", name: admin ? "Inventory Admin" : "Regular User", email: body?.email, role: admin ? "ADMIN" : "USER" },
      });
    }
    if (url.pathname === "/api/vehicles" && method === "GET") return json({ vehicles });
    if (url.pathname === "/api/vehicles/search" && method === "GET") {
      return json({ vehicles, total: vehicles.length, page: 1, pageSize: 12, totalPages: vehicles.length ? 1 : 0 });
    }
    if (url.pathname === "/api/vehicles" && method === "POST") {
      if (failCreate) return json({ error: { code: "FORBIDDEN", message: "Administrator access required." } }, 403);
      const created: Vehicle = { id: civicId, ...body } as Vehicle;
      vehicles = [created, ...vehicles];
      return json({ vehicle: created }, 201);
    }
    const vehiclePath = `/api/vehicles/${corolla.id}`;
    if (url.pathname === vehiclePath && method === "PUT") {
      vehicles = vehicles.map((vehicle) => vehicle.id === corolla.id ? { ...vehicle, ...body } as Vehicle : vehicle);
      return json({ vehicle: vehicles.find((vehicle) => vehicle.id === corolla.id) });
    }
    if (url.pathname === `${vehiclePath}/restock` && method === "POST") {
      vehicles = vehicles.map((vehicle) => vehicle.id === corolla.id ? { ...vehicle, quantity: vehicle.quantity + Number(body?.quantity) } : vehicle);
      return json({ vehicle: vehicles.find((vehicle) => vehicle.id === corolla.id) });
    }
    if (url.pathname === vehiclePath && method === "DELETE") {
      vehicles = vehicles.filter((vehicle) => vehicle.id !== corolla.id);
      return new Response(null, { status: 204 });
    }
    return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function signIn(email = "admin@example.com") {
  render(<App />);
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "StrongPass123!" } });
  const buttons = screen.getAllByRole("button", { name: /^Sign in$/i });
  fireEvent.click(buttons[buttons.length - 1]);
  if (email === "admin@example.com") {
    expect(await screen.findByRole("heading", { name: /^Manage inventory$/i })).toBeInTheDocument();
    expect(await screen.findByText("Corolla")).toBeInTheDocument();
  } else {
    expect(await screen.findByRole("heading", { name: /^Explore inventory$/i })).toBeInTheDocument();
  }
}

function mutation(method: string, path: string) {
  return requests.find((request) => request.method === method && request.path === path);
}

describe("admin inventory management", () => {
  it("routes administrators to management and keeps regular users on the customer screen", async () => {
    await signIn();
    expect(screen.getByRole("button", { name: /^Add vehicle$/i })).toBeInTheDocument();
    expect(requests.some((request) => request.path === "/api/vehicles" && request.method === "GET" && request.authorization === "Bearer admin-token")).toBe(true);

    cleanup();
    await signIn("user@example.com");
    expect(screen.queryByRole("button", { name: /^Add vehicle$/i })).not.toBeInTheDocument();
  });

  it("lets an administrator browse the catalogue and return to management", async () => {
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: /^Browse inventory$/i }));
    expect(await screen.findByRole("heading", { name: /^Explore inventory$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add vehicle$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Manage inventory$/i }));
    expect(await screen.findByRole("heading", { name: /^Manage inventory$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add vehicle$/i })).toBeInTheDocument();
  });

  it("creates a vehicle with a numeric initial stock", async () => {
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: /^Add vehicle$/i }));
    fireEvent.change(screen.getByLabelText(/^Make$/i), { target: { value: "Honda" } });
    fireEvent.change(screen.getByLabelText(/^Model$/i), { target: { value: "Civic" } });
    fireEvent.change(screen.getByLabelText(/^Category$/i), { target: { value: "Sedan" } });
    fireEvent.change(screen.getByLabelText(/^Price$/i), { target: { value: "1500000.00" } });
    fireEvent.change(screen.getByLabelText(/^Quantity$/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create vehicle$/i }));

    await waitFor(() => expect(mutation("POST", "/api/vehicles")).toMatchObject({
      body: { make: "Honda", model: "Civic", category: "Sedan", price: "1500000.00", quantity: 2 },
      authorization: "Bearer admin-token",
    }));
    expect(await screen.findByText("Civic")).toBeInTheDocument();
  });

  it("edits vehicle details without sending quantity", async () => {
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: /^Edit Toyota Corolla$/i }));
    fireEvent.change(screen.getByLabelText(/^Model$/i), { target: { value: "Corolla Cross" } });
    fireEvent.change(screen.getByLabelText(/^Price$/i), { target: { value: "1500000.00" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save changes$/i }));

    await waitFor(() => expect(mutation("PUT", `/api/vehicles/${corolla.id}`)).toMatchObject({
      body: { make: "Toyota", model: "Corolla Cross", category: "Sedan", price: "1500000.00" },
      authorization: "Bearer admin-token",
    }));
    expect(mutation("PUT", `/api/vehicles/${corolla.id}`)?.body).not.toHaveProperty("quantity");
    expect(await screen.findByText("Corolla Cross")).toBeInTheDocument();
  });

  it("restocks a sold-out listing with a positive integer", async () => {
    vehicles = [{ ...corolla, quantity: 0 }];
    await signIn();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Restock Toyota Corolla$/i }));
    fireEvent.change(screen.getByLabelText(/^Units to add$/i), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add stock$/i }));

    await waitFor(() => expect(mutation("POST", `/api/vehicles/${corolla.id}/restock`)).toMatchObject({
      body: { quantity: 3 },
      authorization: "Bearer admin-token",
    }));
    expect(await screen.findByText(/3\s+(?:available|in stock|units)/i)).toBeInTheDocument();
  });

  it("requires confirmation before deleting a listing", async () => {
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: /^Delete Toyota Corolla$/i }));
    expect(mutation("DELETE", `/api/vehicles/${corolla.id}`)).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.getByText("Corolla")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Delete Toyota Corolla$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Confirm delete$/i }));
    await waitFor(() => expect(mutation("DELETE", `/api/vehicles/${corolla.id}`)).toMatchObject({ authorization: "Bearer admin-token" }));
    await waitFor(() => expect(screen.queryByText("Corolla")).not.toBeInTheDocument());
  });

  it("keeps keyboard focus inside delete confirmation and restores it on Escape", async () => {
    await signIn();
    const trigger = screen.getByRole("button", { name: /^Delete Toyota Corolla$/i });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /^Delete Toyota Corolla\?$/i });
    const close = within(dialog).getByRole("button", { name: /^Close dialog$/i });
    const cancel = within(dialog).getByRole("button", { name: /^Cancel$/i });
    const confirm = within(dialog).getByRole("button", { name: /^Confirm delete$/i });
    expect(cancel).toHaveFocus();

    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("focuses the first form field and returns focus to Add vehicle on cancel", async () => {
    await signIn();
    const trigger = screen.getByRole("button", { name: /^Add vehicle$/i });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: /^Add vehicle$/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Make$/i })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("shows an API permission error instead of claiming creation succeeded", async () => {
    failCreate = true;
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: /^Add vehicle$/i }));
    fireEvent.change(screen.getByLabelText(/^Make$/i), { target: { value: "Honda" } });
    fireEvent.change(screen.getByLabelText(/^Model$/i), { target: { value: "Civic" } });
    fireEvent.change(screen.getByLabelText(/^Category$/i), { target: { value: "Sedan" } });
    fireEvent.change(screen.getByLabelText(/^Price$/i), { target: { value: "1500000.00" } });
    fireEvent.change(screen.getByLabelText(/^Quantity$/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create vehicle$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Administrator access required.");
    expect(screen.queryByText("Civic")).not.toBeInTheDocument();
  });
});
