import express from "express";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import request from "supertest";
import { expect, it } from "vitest";
import { mountStaticWeb } from "../src/static-web.js";

it("serves the built app and falls back to it for browser routes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dealership-static-"));
  try {
    await writeFile(join(directory, "index.html"), "<h1>Dealership</h1>");
    const app = express();
    mountStaticWeb(app, directory);
    expect((await request(app).get("/")).text).toContain("Dealership");
    expect((await request(app).get("/inventory/123")).text).toContain("Dealership");
    expect((await request(app).get("/api/missing")).status).toBe(404);
  } finally {
    const root = resolve(tmpdir()) + sep;
    if (!resolve(directory).startsWith(root) || !directory.split(sep).at(-1)?.startsWith("dealership-static-")) {
      throw new Error("Refusing to remove an unexpected temporary directory.");
    }
    await rm(directory, { recursive: true, force: true });
  }
});
