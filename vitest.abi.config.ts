import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "abi",
    environment: "node",
    include: ["scripts/abi/**/*.test.mjs"],
    exclude: ["**/node_modules/**"],
  },
});
