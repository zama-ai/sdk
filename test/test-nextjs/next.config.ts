import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@zama-fhe/test-components"],
  turbopack: {
    // Override tsconfig paths for @zama-fhe/* packages so Turbopack resolves
    // from the pre-built dist (via package.json exports) instead of source.
    // The source contains a rolldown-specific `?iife` import that Turbopack
    // cannot process. tsconfig paths are still used by `tsc --noEmit`.
    resolveAlias: {
      "@zama-fhe/sdk": "@zama-fhe/sdk",
      "@zama-fhe/sdk/*": "@zama-fhe/sdk/*",
      "@zama-fhe/react-sdk": "@zama-fhe/react-sdk",
      "@zama-fhe/react-sdk/*": "@zama-fhe/react-sdk/*",
    },
  },
};

export default nextConfig;
