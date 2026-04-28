import { defineConfig, type Plugin } from "vitest/config";
import path from "node:path";

/** Stub `?iife` imports in tests — returns an empty string instead of file contents. */
function iifeStub(): Plugin {
  return {
    name: "iife-stub",
    enforce: "pre",
    resolveId(source) {
      if (source.endsWith("?iife")) {
        return `\0${source}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith("\0") && id.endsWith("?iife")) {
        return "export default ''; export const filename = 'stub.worker.js';";
      }
      return null;
    },
  };
}

const sharedResolve = {
  dedupe: ["wagmi", "react", "react-dom", "@tanstack/react-query"],
  alias: [
    {
      find: /^@zama-fhe\/sdk\/cleartext$/,
      replacement: path.resolve(__dirname, "./packages/sdk/src/relayer/cleartext/index.ts"),
    },
    {
      find: /^@zama-fhe\/sdk\/(.+)/,
      replacement: path.resolve(__dirname, "./packages/sdk/src/$1"),
    },
    {
      find: "@zama-fhe/sdk",
      replacement: path.resolve(__dirname, "./packages/sdk/src"),
    },
    {
      find: /^@zama-fhe\/react-sdk\/(.+)/,
      replacement: path.resolve(__dirname, "./packages/react-sdk/src/$1"),
    },
    {
      find: /^@zama-fhe\/react-sdk$/,
      replacement: path.resolve(__dirname, "./packages/react-sdk/src"),
    },
    {
      find: /^wagmi\/actions$/,
      replacement: path.resolve(
        __dirname,
        "./packages/react-sdk/node_modules/wagmi/dist/esm/exports/actions.js",
      ),
    },
    {
      find: /^wagmi$/,
      replacement: path.resolve(
        __dirname,
        "./packages/react-sdk/node_modules/wagmi/dist/esm/exports/index.js",
      ),
    },
  ],
};

export default defineConfig({
  test: {
    projects: [
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
        resolve: sharedResolve,
      },
      {
        test: {
          name: "typecheck",
          include: ["packages/sdk/**/*.test-d.ts"],
          typecheck: {
            enabled: true,
            tsconfig: "./packages/sdk/tsconfig.json",
          },
        },
        resolve: sharedResolve,
      },
      {
        plugins: [iifeStub()],
        test: {
          name: "react-sdk",
          environment: "happy-dom",
          pool: process.env.CI ? "forks" : "vmForks",
          include: [
            "packages/react-sdk/**/*.test.{ts,tsx}",
            "packages/sdk/src/worker/__tests__/*.test.ts",
          ],
          exclude: ["**/*integration.test.ts", "**/node_modules/**"],
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
        },
        resolve: sharedResolve,
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
        "**/worker/relayer-sdk.worker.ts",
        "**/worker/relayer-sdk.node-worker.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
});
