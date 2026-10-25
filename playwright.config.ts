import { defineConfig, devices } from "@playwright/test";

const apiOrigin = "http://localhost:3001";
const webOrigin = "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @dealership/api dev",
      url: `${apiOrigin}/api/health`,
      env: {
        ...process.env,
        JWT_SECRET: process.env.JWT_SECRET ?? "local-e2e-secret-at-least-thirty-two-characters",
        CORS_ORIGIN: webOrigin,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      name: "API",
    },
    {
      command: "pnpm --filter @dealership/web dev --host localhost",
      url: webOrigin,
      env: { ...process.env, VITE_API_URL: apiOrigin },
      reuseExistingServer: false,
      timeout: 120_000,
      name: "Web",
    },
  ],
});
