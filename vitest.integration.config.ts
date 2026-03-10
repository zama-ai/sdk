import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/__tests__/integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: [
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
