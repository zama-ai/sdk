import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "viem/index": "src/viem/index.ts",
      "ethers/index": "src/ethers/index.ts",
      "node/index": "src/node/index.ts",
      "cleartext/index": "src/cleartext/index.ts",
      "relayer-sdk.node-worker": "src/worker/relayer-sdk.node-worker.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: true,
    clean: true,
    outDir: "dist",
    external: ["viem", "ethers", "@zama-fhe/relayer-sdk"],
    treeshake: true,
    sourcemap: true,
    tsconfig: "tsconfig.build.json",
    esbuildOptions(options) {
      options.minifySyntax = true;
      options.minifyWhitespace = true;
    },
  },
  {
    entry: {
      "relayer-sdk.worker": "src/worker/relayer-sdk.worker.ts",
    },
    format: ["iife"],
    outExtension: () => ({ js: ".js" }),
    dts: false,
    splitting: false,
    clean: false,
    outDir: "dist",
    external: [],
    treeshake: true,
    sourcemap: true,
    tsconfig: "tsconfig.build.json",
  },
]);
