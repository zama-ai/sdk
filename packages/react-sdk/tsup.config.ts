import { defineConfig } from "tsup";
import { readFileSync, writeFileSync, existsSync } from "fs";

const USE_CLIENT_BANNER = '"use client";\n';

export default defineConfig({
  entry: {
    index: "src/index.ts",
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
    "wagmi",
    "@zama-fhe/sdk",
    "@zama-fhe/relayer-sdk",
  ],
  treeshake: true,
  sourcemap: true,
  tsconfig: "tsconfig.build.json",
  plugins: [
    {
      name: "use-client-directive",
      buildEnd({ writtenFiles }) {
        for (const { name } of writtenFiles) {
          if (name.endsWith(".js") && existsSync(name)) {
            writeFileSync(name, USE_CLIENT_BANNER + readFileSync(name, "utf8"));
          }
        }
      },
    },
  ],
});
