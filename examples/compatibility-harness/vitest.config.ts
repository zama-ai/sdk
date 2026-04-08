import { defineConfig } from "vitest/config";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

// ── Pluggable signer adapter ───────────────────────────────────────────────────
//
// By default the harness uses src/adapter/index.ts (built-in EOA adapter).
//
// To use a different adapter without modifying any source file, set SIGNER_MODULE
// to the path of a module exporting:
//   - `adapter` (preferred), or
//   - `signer` (legacy compatibility wrapper),
// and optionally `ready` for async initialization:
//
//   SIGNER_MODULE=./examples/crossmint/signer.ts npm test
//
// The alias below intercepts imports of src/adapter/index.{ts,js} and
// src/signer/index.{ts,js} at the Vite/vitest level and redirects them to the
// specified module — no file copy and no harness source edits required.

const signerModule = process.env.SIGNER_MODULE ? resolve(process.env.SIGNER_MODULE) : null;

// Use a per-run ID so parallel runs in the same machine do not share report temp files.
if (!process.env.ZAMA_HARNESS_RUN_ID) {
  process.env.ZAMA_HARNESS_RUN_ID = `${Date.now()}-${randomUUID()}`;
}

export default defineConfig({
  resolve: {
    alias: signerModule
      ? [
          {
            // Matches the entire import specifier ending with /adapter/index.ts or /signer/index.ts
            // ^.* is required so that id.replace(regex, replacement) substitutes
            // the whole string, not just the suffix (which would produce ../abs/path).
            find: /^.*[/\\](adapter|signer)[/\\]index\.(ts|js)$/,
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
    fileParallelism: false,
    // Run test files sequentially so results appear in a predictable order.
    sequence: { concurrent: false },
    // Include files explicitly to control execution order:
    // 1. Adapter profile
    // 2. Identity / verification
    // 3. Raw transaction flow
    // 4. Adapter execution
    // 5. Zama authorization
    // 6. Zama write flow
    include: [
      "src/tests/adapterProfile.test.ts",
      "src/tests/eip712.test.ts",
      "src/tests/transaction.test.ts",
      "src/tests/adapterExecution.test.ts",
      "src/tests/zamaFlow.test.ts",
      "src/tests/zamaWriteFlow.test.ts",
    ],
  },
});
