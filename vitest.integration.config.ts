import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import { sharedConfig } from "./vitest.shared.mjs";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/__tests__/*.integration.test.ts",
      "packages/**/__tests__/integration.test.ts",
    ],
    setupFiles: ["dotenv/config"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: dotenv.config().parsed,
  },
  ssr: sharedConfig.ssr,
});
