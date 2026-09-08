import { defineConfig, devices } from "@playwright/test";
import { VITE_PORT } from "./fixtures/constants";

const CI = !!process.env.CI;

/** Open testnet the offload page targets; its hosted relayer needs no API key. */
const LIVE_CHAIN = process.env.VITE_LIVE_CHAIN ?? "sepolia";

/**
 * Fully-live encrypt offload lane: real FHE key download, real proof in the
 * worker and a real relayer round-trip. No anvil, because the flow is
 * encrypt-only and signs no transaction. Runs in a NON-REQUIRED CI job, so a
 * relayer or RPC blip never blocks a merge.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/encrypt-offload-live.spec.ts"],
  outputDir: "./test-results/live/",
  fullyParallel: false,
  forbidOnly: CI,
  // Network flakiness is expected here; the lane is advisory, not a gate.
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: CI ? "github" : "list",
  // Setup (checkout, install, browser install, monorepo build) runs in the same
  // 45 min CI job before this clock starts, so globalTimeout must leave enough
  // room for Playwright to expire on its own and write the report and traces.
  globalTimeout: 1500000,
  expect: { timeout: 30000 },
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: CI ? "chromium" : "chrome",
  },
  projects: [
    {
      name: "vite-live",
      use: { baseURL: `http://localhost:${VITE_PORT}`, ...devices["Desktop Chrome"] },
      // The page downloads a ~50 MB key before any proof runs.
      timeout: 600000,
    },
  ],
  webServer: [
    {
      // In CI the app is prebuilt with VITE_LIVE_CHAIN baked in; locally the dev
      // server reads it from the environment at startup.
      command: CI
        ? "pnpm --filter @zama-fhe/test-vite preview"
        : `VITE_LIVE_CHAIN=${LIVE_CHAIN} pnpm --filter @zama-fhe/test-vite dev`,
      port: VITE_PORT,
      reuseExistingServer: !CI,
    },
  ],
});
