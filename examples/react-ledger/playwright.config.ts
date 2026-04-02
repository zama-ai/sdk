import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // Retry once in CI to absorb transient flakiness (race conditions, port bind delays).
  // No retries locally so failures stay visible immediately.
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Force the RPC URL to empty so that any .env.local override cannot bypass the
    // interceptRpc route mock — tests must always go through the Playwright interceptor.
    env: { NEXT_PUBLIC_SEPOLIA_RPC_URL: "" },
  },
  projects: [
    {
      name: "chromium",
      // WebHID is a Chromium-only API — tests must run in a Chromium-based browser.
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
