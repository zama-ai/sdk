import { defineConfig, devices } from "@playwright/test";
import { NEXTJS_ANVIL_PORT, NEXTJS_PORT, VITE_ANVIL_PORT, VITE_PORT } from "./fixtures/constants";
import type { WorkerFixtures } from "./fixtures/test";

const CI = !!process.env.CI;

export default defineConfig<{}, WorkerFixtures>({
  testDir: "./tests",
  outputDir: "./test-results/",
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: 2,
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
      testIgnore: ["**/node/**", "**/*.node.spec.ts"],
      workers: 1,
      use: {
        baseURL: `http://localhost:${NEXTJS_PORT}`,
        anvilPort: NEXTJS_ANVIL_PORT,
        ...devices["Desktop Chrome"],
      },
      timeout: 30000,
    },
    {
      name: "vite",
      testIgnore: ["**/node/**", "**/*.node.spec.ts"],
      workers: 1,
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
      command: `./start-anvil.sh ${NEXTJS_ANVIL_PORT}`,
      name: "anvil-nextjs",
      wait: {
        stdout: /Anvil ready on port (\d+)/,
      },
      timeout: 60_000,
    },
    {
      command: CI
        ? `NEXT_PUBLIC_ANVIL_PORT=${NEXTJS_ANVIL_PORT} pnpm --filter @zama-fhe/test-nextjs start`
        : `NEXT_PUBLIC_ANVIL_PORT=${NEXTJS_ANVIL_PORT} pnpm --filter @zama-fhe/test-nextjs dev`,
      port: NEXTJS_PORT,
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
        ? `VITE_ANVIL_PORT=${VITE_ANVIL_PORT} pnpm --filter @zama-fhe/test-vite preview`
        : `VITE_ANVIL_PORT=${VITE_ANVIL_PORT} pnpm --filter @zama-fhe/test-vite dev`,
      port: VITE_PORT,
      reuseExistingServer: !CI,
    },
  ],
});
