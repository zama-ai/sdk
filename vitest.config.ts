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
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/"],
    },
  },
  resolve: {
    dedupe: ["wagmi", "react", "react-dom", "@tanstack/react-query"],
    alias: [
      {
        find: /^@zama-fhe\/token-sdk\/(.+)/,
        replacement: path.resolve(__dirname, "./packages/token-sdk/src/$1"),
      },
      {
        find: "@zama-fhe/token-sdk",
        replacement: path.resolve(__dirname, "./packages/token-sdk/src"),
      },
      {
        find: /^@zama-fhe\/token-react-sdk\/(.+)/,
        replacement: path.resolve(
          __dirname,
          "./packages/token-react-sdk/src/$1",
        ),
      },
      {
        find: /^@zama-fhe\/token-react-sdk$/,
        replacement: path.resolve(__dirname, "./packages/token-react-sdk/src"),
      },
    ],
  },
});
