import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@zama-fhe/react-sdk", "@zama-fhe/sdk"],
};

export default nextConfig;
