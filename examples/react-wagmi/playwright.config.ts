import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3004", trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3004",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Force the default RPC URL so mockRpc's intercept pattern always matches.
    // Without this, a dev's .env.local override would bypass the route mock.
    // Force the injected-wallet stack and the testnet environment: the suite drives a
    // mocked window.ethereum, which Privy's modal cannot use, and a custom-environment
    // .env.local would otherwise leak into the run.
    // Bind the vault demo to the mocked cUSDC pair (MOCK_CTOKEN1_ADDRESS) so the
    // ConfidentialVault cards render when that token is selected in e2e.
    env: {
      NEXT_PUBLIC_SEPOLIA_RPC_URL: "",
      NEXT_PUBLIC_PRIVY_APP_ID: "",
      NEXT_PUBLIC_ZAMA_ENV: "",
      NEXT_PUBLIC_REGISTRY_ADDRESS: "",
      NEXT_PUBLIC_VAULT_ADDRESS: "0x5555555555555555555555555555555555555555",
      NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN: "0x2222222222222222222222222222222222222222",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
