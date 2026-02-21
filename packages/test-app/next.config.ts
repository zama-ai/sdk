import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type checking is handled by root `pnpm typecheck`. The test-app has
    // cross-package type mismatches (e.g. viem version differences with
    // burner-connector) that are benign at runtime.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
