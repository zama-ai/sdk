import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@zama-fhe/test-components"],
  // Cross-origin isolation enables SharedArrayBuffer, which the SDK's FHE WASM
  // needs to run multi-threaded (see `runtime.numberOfThreads` in providers.tsx).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
