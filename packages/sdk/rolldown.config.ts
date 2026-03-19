import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";
import { iife } from "./iife-plugin";
import { relayerSdkUmd } from "./relayer-sdk-umd-plugin";

const shared = {
  external: [/^viem/, /^ethers/, /^@zama-fhe\/relayer-sdk/, /^@tanstack\/query-core/, /^node:/],
  resolve: {
    tsconfigFilename: "tsconfig.build.json",
  },
  treeshake: true,
};

const entryPoints = {
  index: "src/index.ts",
  "cleartext/index": "src/relayer/cleartext/index.ts",
  "query/index": "src/query/index.ts",
  "viem/index": "src/viem/index.ts",
  "ethers/index": "src/ethers/index.ts",
};

export default defineConfig([
  // ESM build (primary)
  {
    input: {
      ...entryPoints,
      "node/index": "src/node/index.ts",
      "relayer-sdk.node-worker": "src/worker/relayer-sdk.node-worker.ts",
    },
    output: {
      dir: "dist/esm",
      format: "esm",
      sourcemap: true,
      minify: true,
    },
    ...shared,
    plugins: [
      iife({ tsconfig: "tsconfig.build.json" }),
      dts({ tsconfig: "tsconfig.build.json" }),
      relayerSdkUmd(),
    ],
  },
  // CJS build (for moduleResolution: "node" / CommonJS consumers)
  {
    input: entryPoints,
    output: {
      dir: "dist/cjs",
      format: "cjs",
      entryFileNames: "[name].cjs",
      chunkFileNames: "[name].cjs",
      sourcemap: true,
      minify: true,
    },
    ...shared,
    plugins: [iife({ tsconfig: "tsconfig.build.json" })],
  },
]);
