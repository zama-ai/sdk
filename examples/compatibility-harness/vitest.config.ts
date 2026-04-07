import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// ── Pluggable signer adapter ───────────────────────────────────────────────────
//
// By default the harness uses src/signer/index.ts (built-in EOA signer).
//
// To use a different adapter without modifying any source file, set SIGNER_MODULE
// to the path of any file that exports a `signer` object satisfying the Signer
// interface (and optionally a `ready` promise for async init):
//
//   SIGNER_MODULE=./examples/crossmint/signer.ts npm test
//
// The alias below intercepts every import of src/signer/index.{ts,js} at the
// Vite/vitest level and transparently redirects it to the specified file —
// no file copying, no source modification.

const signerModule = process.env.SIGNER_MODULE ? resolve(process.env.SIGNER_MODULE) : null;

export default defineConfig({
  resolve: {
    alias: signerModule
      ? [
          {
            // Matches any import whose specifier ends with /signer/index.ts or .js
            find: /[/\\]signer[/\\]index\.(ts|js)$/,
            replacement: signerModule,
          },
        ]
      : [],
  },
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
