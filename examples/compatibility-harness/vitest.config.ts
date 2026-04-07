import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/setup.ts"],
    testTimeout: 60_000, // network calls to relayer + RPC can be slow
    hookTimeout: 30_000,
    globalSetup: "./src/report/global-setup.ts",
    // Run test files sequentially so results appear in a predictable order.
    sequence: { concurrent: false },
    // Include files explicitly to control execution order:
    // 1. Signer profile (always first — populates report header)
    // 2. EIP-712 (fast, no network) — 3. Transaction — 4. Zama Flow
    include: [
      "src/tests/signerType.test.ts",
      "src/tests/eip712.test.ts",
      "src/tests/transaction.test.ts",
      "src/tests/zamaFlow.test.ts",
    ],
  },
});
