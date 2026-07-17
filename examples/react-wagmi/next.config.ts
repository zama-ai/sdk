import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // wagmi ≥3.7 ships Tempo connectors with a bare optional `import("accounts")`
    // that only Turbopack knows to skip; stub it out so `next dev --webpack` builds.
    // The import is only reached when a Tempo connector is used, which this app never does.
    config.resolve.alias = { ...config.resolve.alias, accounts: false };
    return config;
  },
};

export default nextConfig;
