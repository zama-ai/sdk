import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: "./playwright/tests",
  outputDir: "./playwright/test-results/",
  snapshotDir: "./playwright/snapshots/",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: process.env.CI ? 60000 : 60000,
  expect: {
    timeout: process.env.CI ? 20000 : 5000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command: "npm --prefix ../../hardhat run node",
      port: 8545,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: process.env.CI ? "pnpm start" : "pnpm dev:e2e",
      port: PORT,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
