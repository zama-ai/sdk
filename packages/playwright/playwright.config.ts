import { defineConfig, devices } from "@playwright/test";

const NEXTJS_PORT = 3100;
const VITE_PORT = 3200;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results/",
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
      testDir: "./tests",
      use: {
        baseURL: `http://localhost:${NEXTJS_PORT}`,
        ...devices["Desktop Chrome"],
      },
      timeout: 30000,
    },
    {
      name: "vite",
      testDir: "./tests",
      use: {
        baseURL: `http://localhost:${VITE_PORT}`,
        ...devices["Desktop Chrome"],
      },
      timeout: 30000,
    },
  ],
  webServer: [
    {
      command: "npm --prefix ../../hardhat run node",
      port: 8545,
      reuseExistingServer: !CI,
    },
    {
      command: CI
        ? "pnpm --filter @zama-fhe/test-nextjs start"
        : "pnpm --filter @zama-fhe/test-nextjs dev:e2e",
      port: NEXTJS_PORT,
      reuseExistingServer: !CI,
    },
    {
      command: CI
        ? "pnpm --filter @zama-fhe/test-vite preview"
        : "pnpm --filter @zama-fhe/test-vite dev:e2e",
      port: VITE_PORT,
      reuseExistingServer: !CI,
    },
  ],
});
