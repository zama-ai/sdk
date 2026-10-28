// Sets a per-request Content-Security-Policy on every page. Next.js reads the nonce from
// the request's CSP header and stamps it on the scripts it emits, so no inline script can
// run without it; pages therefore render per request. The policy governs the page and the
// workers it spawns. The SDK's encrypt worker is served from /_next/static with no policy
// of its own, so its relayer and key-storage fetches are not subject to this one.
import { NextResponse, type NextRequest } from "next/server";
import { envList } from "@/lib/env";
import { NETWORK_KEYS, networks } from "@/lib/networks";

// Everything the page connects to: this origin (relayer proxy, /api/networks, WASM and
// worker files), the RPC of every network in the table (the SDK probes the wallet's chain
// on connect, served or not), the storage each relayer's `keyurl` names for the FHE public
// key and CRS (CSP_CONNECT_SRC, since the relayer owns that address), and data: URLs, which
// the FHE runtime fetches to compile its WASM when encryption runs in the page instead of
// the encrypt worker.
// Privy's wallet modal (opt-in through NEXT_PUBLIC_PRIVY_APP_ID, see src/lib/wallet.tsx) runs
// in an iframe, talks to its API and to WalletConnect's relay, and styles its components
// inline. Sources per https://docs.privy.io/security/implementation-guide/content-security-policy.
const privyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
const privyFrameSrc = [
  "https://auth.privy.io",
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
];
const privyConnectSrc = [
  "https://auth.privy.io",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
  "wss://www.walletlink.org",
  "https://*.rpc.privy.systems",
  "https://explorer-api.walletconnect.com",
];

const connectSrc = new Set([
  "'self'",
  ...NETWORK_KEYS.map((key) => new URL(networks[key].chain.rpcUrls.default.http[0]).origin),
  ...envList("CSP_CONNECT_SRC"),
  "data:",
  ...(privyEnabled ? privyConnectSrc : []),
]);

const isDev = process.env.NODE_ENV === "development";

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': the FHE runtime compiles WASM. 'unsafe-eval': only `next dev`,
    // which uses eval to rebuild server stack traces in the browser.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    // `next dev` injects stylesheets inline; a production build links them. Privy's modal
    // injects its own, so enabling it keeps inline styles allowed in production too.
    `style-src 'self' ${isDev || privyEnabled ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // ws: is the dev server's hot-reload socket.
    `connect-src ${[...connectSrc].join(" ")}${isDev ? " ws:" : ""}`,
    // The SDK's encrypt worker is a bundled file; the FHE runtime compiles WASM in blob workers.
    "worker-src 'self' blob:",
    // Privy's modal: its iframe, WalletConnect's verification iframes, and the wallet icons
    // (inline, or fetched from WalletConnect's explorer API for its wallet list).
    ...(privyEnabled
      ? [
          `frame-src ${privyFrameSrc.join(" ")}`,
          `child-src ${privyFrameSrc.join(" ")}`,
          "img-src 'self' data: blob: https://explorer-api.walletconnect.com",
        ]
      : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  // On the request so Next.js picks the nonce up while rendering, on the response so the
  // browser enforces it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Pages only: API responses and static assets carry no inline script, and a prefetch renders
// nothing, so it needs no nonce.
export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static/|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
