import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

const shared = {
  external: [/^viem/, /^ethers/, /^@zama-fhe\/relayer-sdk/, /^@tanstack\/query-core/, /^node:/],
  resolve: {
    tsconfigFilename: "tsconfig.build.json",
  },
  treeshake: true,
};

export default defineConfig([
  {
    input: {
      index: "src/index.ts",
      "cleartext/index": "src/relayer/cleartext/index.ts",
      "chains/index": "src/chains/index.ts",
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
    plugins: [dts({ tsconfig: "tsconfig.build.json" })],
  },
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
]);
