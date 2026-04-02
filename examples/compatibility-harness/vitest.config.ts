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
    // 1. EIP-712 (fast, local) — 2. Transaction — 3. Zama Flow — 4. Signer type
    include: [
      "src/tests/eip712.test.ts",
      "src/tests/transaction.test.ts",
      "src/tests/zamaFlow.test.ts",
      "src/tests/signerType.test.ts",
    ],
  },
});
