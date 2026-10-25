// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App";

const vehicle = {
  id: "b2c7cc99-6381-4099-ad3e-259a630a85d8",
  make: "Toyota",
  model: "Corolla",
  category: "Sedan",
  price: "1250000.00",
  quantity: 1,
};

type TestVehicle = typeof vehicle;
let inventory: TestVehicle[];
let purchaseStatus: 200 | 409;
let searchFailure: { status: number; message: string } | null;
let searchNetworkFailure: boolean;
let requests: Array<{ method: string; url: URL; body: unknown }>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  inventory = [{ ...vehicle }];
  purchaseStatus = 200;
  searchFailure = null;
  searchNetworkFailure = false;
  requests = [];

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, "http://localhost");
    const method = init?.method?.toUpperCase() ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ method, url, body });

    if (url.pathname === "/api/auth/register" && method === "POST") {
      return json({ user: { id: "user-1", name: body.name, email: body.email, role: "USER" } }, 201);
    }
    if (url.pathname === "/api/auth/login" && method === "POST") {
      return json({ accessToken: "test-token", tokenType: "Bearer", expiresIn: 900, user: { id: "user-1", name: "Asha Kumar", email: "asha@example.com", role: "USER" } });
    }
    if (url.pathname === "/api/vehicles/search" && method === "GET") {
      if (searchNetworkFailure) throw new TypeError("Failed to fetch");
      if (searchFailure) return json({ error: { code: "SEARCH_FAILED", message: searchFailure.message } }, searchFailure.status);
      const matches = url.searchParams.get("inStock") === "true"
        ? inventory.filter((item) => item.quantity > 0)
        : inventory;
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 12);
      return json({ vehicles: matches.slice((page - 1) * pageSize, page * pageSize), total: matches.length, page, pageSize, totalPages: Math.ceil(matches.length / pageSize) });
    }
    if (url.pathname === `/api/vehicles/${vehicle.id}/purchase` && method === "POST") {
      inventory = inventory.map((item) => item.id === vehicle.id ? { ...item, quantity: 0 } : item);
      return purchaseStatus === 200
        ? json({ vehicle: inventory.find((item) => item.id === vehicle.id) })
        : json({ error: { code: "OUT_OF_STOCK", message: "This vehicle is out of stock." } }, 409);
    }
    return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function clickLastButton(name: string) {
  const matches = screen.getAllByRole("button", { name: new RegExp(`^${name}$`, "i") });
  fireEvent.click(matches[matches.length - 1]);
}

function purchaseButton() {
  return screen.getByRole("button", { name: /^Purchase Toyota Corolla$/i });
}

async function signIn() {
  render(<App />);
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: "asha@example.com" } });
  fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "StrongPass123!" } });
  clickLastButton("Sign in");
  expect(await screen.findByRole("heading", { name: /Explore inventory/i })).toBeInTheDocument();
  expect(await screen.findByText(/Corolla/i)).toBeInTheDocument();
}

describe("customer application", () => {
  it("registers a user and prompts them to sign in", async () => {
    render(<App />);
    clickLastButton("Register");
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: "Asha Kumar" } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: "asha@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "StrongPass123!" } });
    clickLastButton("Register");

    expect(await screen.findByText(/Account created\. Sign in to continue\./i)).toBeInTheDocument();
    expect(requests).toContainEqual(expect.objectContaining({
      method: "POST",
      url: expect.objectContaining({ pathname: "/api/auth/register" }),
      body: { name: "Asha Kumar", email: "asha@example.com", password: "StrongPass123!" },
    }));
  });

  it("signs in and loads the inventory", async () => {
    await signIn();
    expect(requests.some((entry) => entry.url.pathname === "/api/auth/login" && entry.method === "POST")).toBe(true);
    expect(requests.some((entry) => entry.url.pathname === "/api/vehicles/search" && entry.method === "GET")).toBe(true);
  });

  it("passes search filters to the API", async () => {
    await signIn();
    fireEvent.change(screen.getByLabelText(/^Make$/i), { target: { value: "Toyota" } });
    fireEvent.change(screen.getByLabelText(/^Max price$/i), { target: { value: "2000000" } });
    clickLastButton("Search");

    await waitFor(() => {
      const searches = requests.filter((entry) => entry.url.pathname === "/api/vehicles/search");
      expect(searches.length).toBeGreaterThan(1);
      expect(searches.at(-1)?.url.searchParams.get("make")).toBe("Toyota");
      expect(searches.at(-1)?.url.searchParams.get("maxPrice")).toBe("2000000");
    });
  });

  it("disables purchase when a vehicle is sold out", async () => {
    inventory = [{ ...vehicle, quantity: 0 }];
    await signIn();
    expect(purchaseButton()).toBeDisabled();
  });

  it("updates the visible stock after a purchase", async () => {
    await signIn();
    fireEvent.click(purchaseButton());
    await waitFor(() => expect(purchaseButton()).toBeDisabled());
    expect(requests.some((entry) => entry.method === "POST" && entry.url.pathname === `/api/vehicles/${vehicle.id}/purchase`)).toBe(true);
  });

  it("removes the last unit from in-stock results after purchase", async () => {
    await signIn();
    fireEvent.click(screen.getByRole("checkbox", { name: /^In stock$/i }));
    clickLastButton("Search");
    await waitFor(() => expect(requests.some((entry) => entry.url.pathname === "/api/vehicles/search" && entry.url.searchParams.get("inStock") === "true")).toBe(true));

    fireEvent.click(purchaseButton());
    expect(await screen.findByRole("heading", { name: "No vehicles found" })).toBeInTheDocument();
    expect(screen.getByText("0 vehicles found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Corolla" })).not.toBeInTheDocument();
  });

  it("shows an out-of-stock error after a competing purchase", async () => {
    purchaseStatus = 409;
    await signIn();
    fireEvent.click(purchaseButton());
    await waitFor(() => {
      expect(requests.filter((entry) => entry.url.pathname === "/api/vehicles/search")).toHaveLength(2);
      expect(purchaseButton()).toBeDisabled();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("This vehicle is out of stock.");
  });

  it("hides stale results during a failed search and restores them after retry", async () => {
    await signIn();
    searchFailure = { status: 503, message: "Inventory is temporarily unavailable." };
    fireEvent.change(screen.getByLabelText(/^Make$/i), { target: { value: "Toyota" } });
    clickLastButton("Search");

    expect(await screen.findByRole("alert")).toHaveTextContent("Inventory is temporarily unavailable.");
    expect(screen.queryByRole("heading", { name: "Corolla" })).not.toBeInTheDocument();
    expect(screen.queryByText("1 vehicle found")).not.toBeInTheDocument();

    searchFailure = null;
    fireEvent.click(screen.getByRole("button", { name: /^Try again$/i }));
    expect(await screen.findByRole("heading", { name: "Corolla" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a network failure without showing old inventory", async () => {
    await signIn();
    searchNetworkFailure = true;
    clickLastButton("Search");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect to the server. Please try again.");
    expect(screen.queryByRole("heading", { name: "Corolla" })).not.toBeInTheDocument();
  });

  it("returns to the last valid page after purchasing its final in-stock vehicle", async () => {
    await signIn();
    inventory = [
      ...Array.from({ length: 12 }, (_, index) => ({ ...vehicle, id: `other-${index}`, model: `Other ${index + 1}` })),
      { ...vehicle },
    ];
    fireEvent.click(screen.getByRole("checkbox", { name: /^In stock$/i }));
    clickLastButton("Search");
    expect(await screen.findByRole("button", { name: /^Next$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(await screen.findByRole("heading", { name: "Corolla" })).toBeInTheDocument();

    fireEvent.click(purchaseButton());
    expect(await screen.findByText("12 vehicles found")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Other 1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No vehicles found" })).not.toBeInTheDocument();
  });

  it("explains when an expired session requires sign-in", async () => {
    await signIn();
    searchFailure = { status: 401, message: "A valid access token is required." };
    clickLastButton("Search");
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your session expired. Sign in again.");
  });
});
