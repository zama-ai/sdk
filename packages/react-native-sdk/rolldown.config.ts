import { defineConfig } from "rolldown";
import { dts } from "rolldown-plugin-dts";

export default defineConfig({
  input: {
    index: "src/index.ts",
    polyfills: "src/polyfills.ts",
  },
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
    minify: true,
  },
  external: [/^react/, /^@tanstack/, /^@zama-fhe/, /^expo/, /^react-native/, /^@fhevm/, /^@babel/],
  resolve: {
    tsconfigFilename: "tsconfig.build.json",
  },
  treeshake: true,
  plugins: [dts({ tsconfig: "tsconfig.build.json" })],
});
