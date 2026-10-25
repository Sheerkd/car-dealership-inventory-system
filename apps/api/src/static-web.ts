import express, { type Express } from "express";
import { join } from "node:path";

export function mountStaticWeb(app: Express, directory: string) {
  app.use(express.static(directory, { index: false }));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
    response.sendFile(join(directory, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}
