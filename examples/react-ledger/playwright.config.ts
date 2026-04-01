import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
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
    env: { NEXT_PUBLIC_HOODI_RPC_URL: "" },
  },
  projects: [
    {
      name: "chromium",
      // WebHID is a Chromium-only API — tests must run in a Chromium-based browser.
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
