import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";
import { inline } from "./inline-plugin";

const shared = {
  external: [/^viem/, /^ethers/, /^@zama-fhe\/relayer-sdk/, /^@tanstack\/query-core/, /^node:/],
  resolve: {
    tsconfigFilename: "tsconfig.build.json",
  },
  treeshake: true,
};

export default defineConfig([
  // Worker IIFE — must build first so the main build can inline it.
  {
    input: {
      "relayer-sdk.worker": "src/worker/relayer-sdk.worker.ts",
    },
    output: {
      dir: "dist",
      format: "iife",
      sourcemap: true,
      entryFileNames: "[name].js",
      minify: true,
    },
    ...shared,
    external: [],
  },
  // Main ESM build — inlines the worker code via the virtual module.
  {
    input: {
      index: "src/index.ts",
      "cleartext/index": "src/relayer/cleartext/index.ts",
      "query/index": "src/query/index.ts",
      "viem/index": "src/viem/index.ts",
      "ethers/index": "src/ethers/index.ts",
      "node/index": "src/node/index.ts",
      "relayer-sdk.node-worker": "src/worker/relayer-sdk.node-worker.ts",
    },
    output: {
      dir: "dist",
      format: "esm",
      sourcemap: true,
      minify: true,
    },
    ...shared,
    plugins: [inline(), dts({ tsconfig: "tsconfig.build.json" })],
  },
]);
