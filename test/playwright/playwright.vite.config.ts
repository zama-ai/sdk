import { defineConfig, devices } from "@playwright/test";
import { MOCK_RELAYER_PORT, VITE_ANVIL_PORT, VITE_PORT } from "./fixtures/constants";
import type { WorkerFixtures } from "./fixtures/test";

const CI = !!process.env.CI;

export default defineConfig<{}, WorkerFixtures>({
  testDir: "./tests",
  testIgnore: ["**/node/**", "**/*.node.spec.ts"],
  outputDir: "./test-results/vite/",
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
      name: "vite",
      use: {
        baseURL: `http://localhost:${VITE_PORT}`,
        anvilPort: VITE_ANVIL_PORT,
        ...devices["Desktop Chrome"],
      },
      timeout: 30000,
    },
  ],
  webServer: [
    {
      command: `node fixtures/relayer-sdk-server.mjs ${MOCK_RELAYER_PORT}`,
      port: MOCK_RELAYER_PORT,
      reuseExistingServer: !CI,
    },
    {
      command: `./start-anvil.sh ${VITE_ANVIL_PORT}`,
      name: "anvil-vite",
      wait: {
        stdout: /Anvil ready on port (\d+)/,
      },
      timeout: 60_000,
    },
    {
      command: CI
        ? `VITE_ANVIL_PORT=${VITE_ANVIL_PORT} VITE_MOCK_RELAYER_PORT=${MOCK_RELAYER_PORT} pnpm --filter @zama-fhe/test-vite preview`
        : `VITE_ANVIL_PORT=${VITE_ANVIL_PORT} VITE_MOCK_RELAYER_PORT=${MOCK_RELAYER_PORT} pnpm --filter @zama-fhe/test-vite dev`,
      port: VITE_PORT,
      reuseExistingServer: !CI,
    },
  ],
});
