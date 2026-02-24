import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["packages/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["packages/sdk/src/**", "packages/token-react-sdk/src/**"],
      exclude: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.types.ts",
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
  resolve: {
    dedupe: ["wagmi", "react", "react-dom", "@tanstack/react-query"],
    alias: [
      {
        find: /^@zama-fhe\/token-sdk\/(.+)/,
        replacement: path.resolve(__dirname, "./packages/sdk/src/$1"),
      },
      {
        find: "@zama-fhe/sdk",
        replacement: path.resolve(__dirname, "./packages/sdk/src"),
      },
      {
        find: /^@zama-fhe\/token-react-sdk\/(.+)/,
        replacement: path.resolve(__dirname, "./packages/token-react-sdk/src/$1"),
      },
      {
        find: /^@zama-fhe\/token-react-sdk$/,
        replacement: path.resolve(__dirname, "./packages/token-react-sdk/src"),
      },
      {
        find: /^wagmi\/actions$/,
        replacement: path.resolve(
          __dirname,
          "./packages/token-react-sdk/node_modules/wagmi/dist/esm/exports/actions.js",
        ),
      },
      {
        find: /^wagmi$/,
        replacement: path.resolve(
          __dirname,
          "./packages/token-react-sdk/node_modules/wagmi/dist/esm/exports/index.js",
        ),
      },
    ],
  },
});
