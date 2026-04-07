import { defineConfig, devices } from "@playwright/test";
import { MOCK_RELAYER_PORT, NEXTJS_ANVIL_PORT, NEXTJS_PORT } from "./fixtures/constants";
import type { WorkerFixtures } from "./fixtures/test";

const CI = !!process.env.CI;

export default defineConfig<{}, WorkerFixtures>({
  testDir: "./tests",
  testIgnore: ["**/node/**", "**/*.node.spec.ts"],
  outputDir: "./test-results/nextjs/",
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: 1,
  reporter: CI ? "github" : "list",
  expect: {
    timeout: CI ? 20000 : 5000,
  },
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "nextjs",
      use: {
        baseURL: `http://localhost:${NEXTJS_PORT}`,
        anvilPort: NEXTJS_ANVIL_PORT,
        ...devices["Desktop Chrome"],
      },
      timeout: 30000,
    },
  ],
  webServer: [
    {
      command: `./start-anvil.sh ${NEXTJS_ANVIL_PORT}`,
      name: "anvil-nextjs",
      wait: {
        stdout: /Anvil ready on port (\d+)/,
      },
      timeout: 90_000,
    },
    {
      command: CI
        ? `NEXT_PUBLIC_ANVIL_PORT=${NEXTJS_ANVIL_PORT} NEXT_PUBLIC_MOCK_RELAYER_PORT=${MOCK_RELAYER_PORT} pnpm --filter @zama-fhe/test-nextjs start`
        : `NEXT_PUBLIC_ANVIL_PORT=${NEXTJS_ANVIL_PORT} NEXT_PUBLIC_MOCK_RELAYER_PORT=${MOCK_RELAYER_PORT} pnpm --filter @zama-fhe/test-nextjs dev`,
      port: NEXTJS_PORT,
      reuseExistingServer: !CI,
    },
  ],
});
