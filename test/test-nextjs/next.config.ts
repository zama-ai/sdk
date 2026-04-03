import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@zama-fhe/test-components"],
};

export default nextConfig;
