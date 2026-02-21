import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "viem/index": "src/viem/index.ts",
    "ethers/index": "src/ethers/index.ts",
    "node/index": "src/node/index.ts",
    "relayer-sdk.worker": "src/worker/relayer-sdk.worker.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  outDir: "dist",
  external: ["viem", "ethers", "@zama-fhe/relayer-sdk"],
  treeshake: true,
  tsconfig: "tsconfig.build.json",
});
