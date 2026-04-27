import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/__tests__/*.integration.test.ts",
      "packages/**/__tests__/integration.test.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: [
      // Let @zama-fhe/sdk/node resolve to the built dist (worker threads need compiled .js)
      {
        find: /^@zama-fhe\/sdk\/node$/,
        replacement: path.resolve(__dirname, "./packages/sdk/dist/esm/node/index.js"),
      },
      {
        find: /^@zama-fhe\/sdk\/(.+)/,
        replacement: path.resolve(__dirname, "./packages/sdk/src/$1"),
      },
      {
        find: "@zama-fhe/sdk",
        replacement: path.resolve(__dirname, "./packages/sdk/src"),
      },
    ],
  },
});
