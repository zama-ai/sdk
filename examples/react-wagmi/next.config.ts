import type { NextConfig } from "next";

// Static security headers for every response. The Content-Security-Policy carries a nonce,
// so it is set per request in the proxy instead.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  env: {
    // Shown in the footer so a visitor can check which commit a deployment runs. Vercel
    // sets VERCEL_GIT_COMMIT_SHA on every build; other hosts set NEXT_PUBLIC_COMMIT_SHA.
    NEXT_PUBLIC_COMMIT_SHA:
      process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "",
  },
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
};

export default nextConfig;
