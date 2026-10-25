import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "../../coverage/web",
      thresholds: { lines: 90, branches: 80, functions: 75 },
    },
  },
}));
