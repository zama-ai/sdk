import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

export default defineConfig({
  input: {
    index: "src/index.ts",
    "wagmi/index": "src/wagmi/index.ts",
  },
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
    minify: true,
    banner: '"use client";',
  },
  external: [
    /^react/,
    /^@tanstack/,
    /^wagmi/,
    /^@wagmi/,
    /^@zama-fhe/,
    /^viem/,
    /^@noble/,
    /^@scure/,
  ],
  resolve: {
    tsconfigFilename: "tsconfig.build.json",
  },
  treeshake: true,
  plugins: [dts({ tsconfig: "tsconfig.build.json" })],
});
