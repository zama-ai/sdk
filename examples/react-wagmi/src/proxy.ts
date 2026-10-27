// Sets a per-request Content-Security-Policy on every page. Next.js reads the nonce from
// the request's CSP header and stamps it on the scripts it emits, so no inline script can
// run without it; pages therefore render per request. The policy governs the page and the
// workers it spawns. The SDK's encrypt worker is served from /_next/static with no policy
// of its own, so its relayer and key-storage fetches are not subject to this one.
import { NextResponse, type NextRequest } from "next/server";
import { envList } from "@/lib/env";
import { networks } from "@/lib/networks";
import { enabledNetworks } from "@/lib/relayers";

// Everything the page connects to: this origin (relayer proxy, /api/networks, WASM and
// worker files), the RPC of every network the server offers, the storage each relayer's
// `keyurl` names for the FHE public key and CRS (CSP_CONNECT_SRC, since the relayer owns
// that address), and data: URLs, which the FHE runtime fetches to compile its WASM when
// encryption runs in the page instead of the encrypt worker.
const connectSrc = new Set([
  "'self'",
  ...enabledNetworks().map((key) => new URL(networks[key].chain.rpcUrls.default.http[0]).origin),
  ...envList("CSP_CONNECT_SRC"),
  "data:",
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
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
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
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
