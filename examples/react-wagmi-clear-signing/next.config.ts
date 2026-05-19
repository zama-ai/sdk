import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ethereum-sourcify/clear-signing"],
  transpilePackages: ["@zama-fhe/react-sdk", "@zama-fhe/sdk"],
};

export default nextConfig;
