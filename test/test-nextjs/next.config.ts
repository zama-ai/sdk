import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@zama-fhe/test-components"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
