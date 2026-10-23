import type { NextRequest } from "next/server";
import { upstreamFor } from "@/lib/relayers";

// The relayer routes the web() transport calls. Anything else is rejected, so the proxy
// cannot be used to reach other relayer endpoints (or, via `..`, anything outside them).
const ALLOWED_ROUTES = new Set([
  "v2/keyurl",
  "v2/input-proof",
  "v2/public-decrypt",
  "v2/user-decrypt",
  "v2/delegated-user-decrypt",
  "v3/user-decrypt",
]);

// Async relayer calls answer 202 with a job id, which the SDK then polls at `<route>/<id>`.
const JOB_ID = /^[a-zA-Z0-9_-]+$/;

function routeAllowed(path: string[]): boolean {
  const [version, route, jobId, ...rest] = path;
  if (rest.length > 0 || !ALLOWED_ROUTES.has(`${version}/${route}`)) return false;
  return jobId === undefined || JOB_ID.test(jobId);
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// Allowlist of request headers to forward to the upstream relayer.
// Using an allowlist (rather than stripping hop-by-hop headers) prevents accidentally
// forwarding browser cookies, Authorization headers, or other sensitive credentials.
// The web() relayer sends content-type, accept, content-length and its x-zama-sdk-* usage headers.
const REQUEST_ALLOW = new Set(["content-type", "accept", "content-length"]);

function forwardHeaders(incoming: Headers, apiKey: string | undefined): Headers {
  const out = new Headers();
  for (const [key, value] of incoming) {
    const name = key.toLowerCase();
    if (REQUEST_ALLOW.has(name) || name.startsWith("x-zama-sdk-")) {
      out.set(key, value);
    }
  }
  if (apiKey) {
    out.set("x-api-key", apiKey);
  }
  return out;
}

// Headers that must not be forwarded from the relayer response back to the browser.
// Includes all hop-by-hop headers (must not cross proxy boundaries) plus content-encoding
// and content-length: Node.js fetch() auto-decompresses gzip/brotli bodies, so
// re-forwarding content-encoding would cause the browser to attempt a second decompression
// pass, producing garbage.
const RESPONSE_DROP = new Set([...HOP_BY_HOP, "content-encoding", "content-length"]);

// Browsers send Origin on every POST and on cross-site GETs, so this stops other sites from
// spending this deployment's relayer quota from their users' browsers. It does not stop
// scripted abuse; rate limit at the hosting layer for that.
function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const configured = process.env.RELAYER_PROXY_ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = configured?.length ? configured : [req.nextUrl.origin];
  return allowed.includes(origin);
}

function reject(status: number, error: string) {
  return Response.json({ error }, { status });
}

async function proxy(req: NextRequest, network: string, path: string[]) {
  // Unknown or unconfigured network → 404, never a default relayer.
  const upstream = upstreamFor(network);
  if (!upstream) return reject(404, "Unknown network");
  if (!originAllowed(req)) return reject(403, "Origin not allowed");

  if (!routeAllowed(path)) return reject(404, "Unknown relayer route");
  const route = path.join("/");

  const url = new URL(route, upstream.url + "/");
  url.search = req.nextUrl.search;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: req.method,
      headers: forwardHeaders(req.headers, upstream.apiKey),
      body: req.body,
      // Abort after 30 s so a hanging relayer doesn't block the Next.js server indefinitely.
      signal: AbortSignal.timeout(30_000),
      // @ts-expect-error -- Node fetch supports duplex for streaming bodies
      duplex: "half",
    });
  } catch (err) {
    // Network failure (unreachable host, DNS error, timeout) — return a JSON error so
    // the web() relayer worker gets valid JSON instead of an HTML 500 page from Next.js.
    // Bodies are never logged: they carry user addresses and handles.
    console.error("[relayer-proxy]", network, route, err);
    return reject(503, "Relayer unreachable");
  }

  const headers = new Headers();
  for (const [key, value] of resp.headers) {
    if (!RESPONSE_DROP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  return new Response(resp.body, { status: resp.status, headers });
}

type Context = { params: Promise<{ network: string; path: string[] }> };

export async function GET(req: NextRequest, { params }: Context) {
  const { network, path } = await params;
  return proxy(req, network, path);
}

export async function POST(req: NextRequest, { params }: Context) {
  const { network, path } = await params;
  return proxy(req, network, path);
}
