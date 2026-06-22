import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "llm",
    environment: "node",
    include: ["scripts/llm/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "docs/gitbook/build/**", "docs/gitbook/book/**"],
  },
});
