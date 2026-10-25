import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "../../coverage/api",
      thresholds: { lines: 80, branches: 85, functions: 85 },
    },
  },
});
