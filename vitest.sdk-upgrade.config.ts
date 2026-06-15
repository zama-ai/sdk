import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sdk-upgrade",
    environment: "node",
    include: ["scripts/sdk-upgrade/**/*.test.mjs"],
    exclude: ["**/node_modules/**"],
  },
});
