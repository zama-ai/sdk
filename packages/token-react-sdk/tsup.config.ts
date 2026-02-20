import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "viem/index": "src/viem/index.ts",
    "ethers/index": "src/ethers/index.ts",
    "wagmi/index": "src/wagmi/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  outDir: "dist",
  external: [
    "react",
    "react-dom",
    "@tanstack/react-query",
    "viem",
    "ethers",
    "wagmi",
    "@zama-fhe/token-sdk",
    "@zama-fhe/relayer-sdk",
  ],
  treeshake: true,
  tsconfig: "tsconfig.build.json",
  banner: {
    js: '"use client";',
  },
});
