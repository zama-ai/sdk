import { defineConfig, devices } from "@playwright/test";

// CI runs the suite against a production build. The CSP differs between `next dev` and
// `next start` (dev allows eval and inline styles), and the production policy is the one a
// deployment serves. Locally the dev server is reused for fast iteration.
const production = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3004", trace: "on-first-retry" },
  webServer: {
    command: production ? "npm run build && npm run start -- -p 3004" : "npm run dev",
    url: "http://localhost:3004",
    reuseExistingServer: !production,
    timeout: production ? 300_000 : 120_000,
    // Applied to the build too, so NEXT_PUBLIC_* values are inlined from here rather than
    // from a dev's .env.local.
    env: {
      // Force the default RPC URLs so mockRpc's intercept patterns always match.
      NEXT_PUBLIC_SEPOLIA_RPC_URL: "",
      NEXT_PUBLIC_MAINNET_RPC_URL: "",
      NEXT_PUBLIC_BNB_TESTNET_RPC_URL: "",
      // Enable the mainnet row so the picker and the mainnet feature flags are testable, and pin
      // Polygon off. Nothing listens on port 9, so a forwarded proxy call fails fast with 503.
      MAINNET_RELAYER_URL: "http://127.0.0.1:9",
      POLYGON_RELAYER_URL: "",
      ENABLED_NETWORKS: "",
      // Bind the vault demo to the mocked cUSDC pair (MOCK_CTOKEN1_ADDRESS) so the
      // ConfidentialVault cards render when that token is selected on Sepolia.
      NEXT_PUBLIC_VAULT_ADDRESS: "0x5555555555555555555555555555555555555555",
      NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN: "0x2222222222222222222222222222222222222222",
      // Pin a commit so the footer test can check the commit link.
      NEXT_PUBLIC_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
      NEXT_PUBLIC_SOURCE_REPO_URL: "",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
