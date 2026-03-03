import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/playwright/fixtures/cleartext-mock/__tests__/integration.test.ts"],
    globalSetup: ["packages/playwright/fixtures/cleartext-mock/__tests__/globalSetup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
