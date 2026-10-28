import type { NextConfig } from "next";

// @privy-io/react-auth lazily imports its optional Solana peer packages. They are not
// installed (this app is ethereum-only, and @solana/kit's peer range rejects TypeScript 7),
// and Turbopack refuses to build an import it cannot resolve, so alias them to a stub.
const PRIVY_SOLANA_STUB = "./src/lib/privy-solana-stub.cjs";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@solana/kit": PRIVY_SOLANA_STUB,
      "@solana-program/memo": PRIVY_SOLANA_STUB,
      "@solana-program/system": PRIVY_SOLANA_STUB,
      "@solana-program/token": PRIVY_SOLANA_STUB,
      "@farcaster/mini-app-solana": PRIVY_SOLANA_STUB,
    },
  },
};

export default nextConfig;
