// Sets a per-request Content-Security-Policy on every page. Next.js reads the nonce from
// the request's CSP header and stamps it on the scripts it emits, so no inline script can
// run without it; pages therefore render per request. The policy governs the page and the
// workers it spawns. The SDK's encrypt worker is served from /_next/static with no policy
// of its own, but the SDK downloads the FHE key on the page thread before it starts the
// worker, so the key storage has to be in connect-src either way.
import { NextResponse, type NextRequest } from "next/server";
import { NETWORK_KEYS, networks } from "@/lib/networks";
import { keyStorageOrigins } from "@/lib/relayers";

// Everything the page connects to: this origin (relayer proxy, /api/networks, WASM and
// worker files), the RPC of every network in the table (the SDK probes the wallet's chain
// on connect, served or not), the storage the relayers' `keyurl` names for the FHE public
// key and CRS, and data: URLs, which the FHE runtime fetches to compile its WASM when
// encryption runs in the page instead of the encrypt worker.
// Dynamic (opt-in through NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID) talks to its API and wallet
// catalogue and pairs over WalletConnect's relay. It renders no UI, so styles stay nonce-only.
const dynamicEnabled = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);
const dynamicConnectSrc = [
  "https://app.dynamicauth.com",
  "https://dynamic-static-assets.com",
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.com",
  "wss://*.walletconnect.org",
];
// WalletConnect's domain verification runs in an iframe.
const dynamicFrameSrc = ["https://verify.walletconnect.com", "https://verify.walletconnect.org"];

const connectSrc = new Set([
  "'self'",
  ...NETWORK_KEYS.map((key) => new URL(networks[key].chain.rpcUrls.default.http[0]).origin),
  ...keyStorageOrigins,
  "data:",
  ...(dynamicEnabled ? dynamicConnectSrc : []),
]);

const isDev = process.env.NODE_ENV === "development";

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': the FHE runtime compiles WASM. 'unsafe-eval': only `next dev`,
    // which uses eval to rebuild server stack traces in the browser.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    // `next dev` injects stylesheets inline; a production build links them.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // ws: is the dev server's hot-reload socket.
    `connect-src ${[...connectSrc].join(" ")}${isDev ? " ws:" : ""}`,
    // The SDK's encrypt worker is a bundled file; the FHE runtime compiles WASM in blob workers.
    "worker-src 'self' blob:",
    // WalletConnect's verification iframes, and wallet icons: catalogue icons come from
    // wallet-book origins nobody enumerates, and EIP-6963 icons are data: URLs.
    ...(dynamicEnabled
      ? [
          `frame-src ${dynamicFrameSrc.join(" ")}`,
          `child-src ${dynamicFrameSrc.join(" ")}`,
          "img-src 'self' data: blob: https:",
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
