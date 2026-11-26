import { defineConfig } from "vitest/config";
import { iifeStub, sharedConfig } from "./vitest.shared.mjs";

export default defineConfig({
  test: {
    projects: [
      "packages/sdk-daemon/vitest.config.ts",
      {
        plugins: [iifeStub()],
        test: {
          name: "sdk",
          environment: "node",
          pool: "vmForks",
          include: ["packages/sdk/**/*.test.{ts,tsx}"],
          exclude: ["**/*integration.test.ts", "**/node_modules/**", "**/worker/__tests__/**"],
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
        },
        ...sharedConfig,
      },
      {
        plugins: [iifeStub()],
        test: {
          // The worker client needs a DOM realm for `Worker` and `structuredClone`.
          name: "sdk-dom",
          environment: "happy-dom",
          pool: process.env.CI ? "forks" : "vmForks",
          include: ["packages/sdk/src/worker/__tests__/*.test.ts"],
          exclude: ["**/node_modules/**"],
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
        },
        ...sharedConfig,
      },
      {
        test: {
          name: "typecheck",
          include: ["packages/sdk/**/*.test-d.ts"],
          typecheck: { enabled: true, tsconfig: "./packages/sdk/tsconfig.json" },
        },
        ...sharedConfig,
      },
      {
        plugins: [iifeStub()],
        test: {
          name: "react-sdk",
          environment: "happy-dom",
          pool: process.env.CI ? "forks" : "vmForks",
          include: ["packages/react-sdk/**/*.test.{ts,tsx}"],
          exclude: ["**/*integration.test.ts", "**/node_modules/**"],
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
        },
        ...sharedConfig,
      },
      {
        test: {
          name: "scripts",
          environment: "node",
          // scripts/llm tests run separately via `pnpm llm:check` (vitest.llm.config.ts).
          include: [
            "scripts/__tests__/*.test.mjs",
            "scripts/docs/**/*.test.mjs",
            "scripts/lint/**/*.test.mjs",
          ],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["packages/sdk/src/**", "packages/react-sdk/src/**"],
      exclude: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.types.ts",
        "**/*.d.ts",
        "**/relayer/relayer-sdk.ts",
        "**/query/factory-types.ts",
        "**/relayer/cleartext/types.ts",
        "**/abi/**",
        "**/index.ts",
        // The worker entry point only runs in a worker realm, not under vitest.
        "**/worker/encrypt.worker.ts",
      ],
      thresholds: { lines: 80, branches: 80, functions: 80 },
    },
  },
});
