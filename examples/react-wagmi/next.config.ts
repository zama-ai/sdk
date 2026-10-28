import type { NextConfig } from "next";

// Static security headers for every response. The Content-Security-Policy carries a nonce,
// so it is set per request in the proxy instead.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // No includeSubDomains: a self-hosted copy on an apex domain would pin every subdomain.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

// @privy-io/react-auth lazily imports its optional Solana peer packages. They are not
// installed (this app is ethereum-only, and @solana/kit's peer range rejects TypeScript 7),
// and Turbopack refuses to build an import it cannot resolve, so alias them to a stub.
const PRIVY_SOLANA_STUB = "./src/lib/privy-solana-stub.cjs";

const nextConfig: NextConfig = {
  env: {
    // Shown in the footer so a visitor can check which commit a deployment runs. Vercel
    // sets VERCEL_GIT_COMMIT_SHA on every build; other hosts set NEXT_PUBLIC_COMMIT_SHA.
    NEXT_PUBLIC_COMMIT_SHA:
      process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "",
  },
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
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
