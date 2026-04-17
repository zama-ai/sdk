import type { NextRequest } from "next/server";

// Default to the public Sepolia testnet relayer — no API key required.
// For production or private deployments, set RELAYER_URL and RELAYER_API_KEY in .env.local.
const DEFAULT_RELAYER_URL = "https://relayer.testnet.zama.org/v2";
const RELAYER_URL = process.env.RELAYER_URL ?? DEFAULT_RELAYER_URL;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY;

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
// RelayerWeb only sends content-type, accept, and content-length — no other headers needed.
const REQUEST_ALLOW = new Set(["content-type", "accept", "content-length"]);

function forwardHeaders(incoming: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of incoming) {
    if (REQUEST_ALLOW.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }
  if (RELAYER_API_KEY) {
    out.set("x-api-key", RELAYER_API_KEY);
  }
  return out;
}

// Headers that must not be forwarded from the relayer response back to the browser.
// Includes all hop-by-hop headers (must not cross proxy boundaries) plus content-encoding
// and content-length: Node.js fetch() auto-decompresses gzip/brotli bodies, so
// re-forwarding content-encoding would cause the browser to attempt a second decompression
// pass, producing garbage.
const RESPONSE_DROP = new Set([...HOP_BY_HOP, "content-encoding", "content-length"]);

// Only allow alphanumeric characters, dots, hyphens, and underscores in path segments.
// Dot-only segments (`.` and `..`) are rejected to prevent path traversal.
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function getRelayerBaseUrl(): URL {
  const baseUrl = new URL(RELAYER_URL);
  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new Error("RELAYER_URL must use http or https");
  }
  return baseUrl;
}

function buildRelayerUrl(path: string[], search: string): URL {
  const url = getRelayerBaseUrl();
  const basePath = url.pathname.replace(/\/+$/u, "");
  url.pathname = `${basePath}/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
  url.search = search;
  return url;
}

async function proxy(req: NextRequest, path: string[]) {
  for (const segment of path) {
    // Reject segments that fail the character allowlist or are dot-only (`.`, `..`).
    // Dot-only segments would resolve to parent directories via URL normalization,
    // allowing a request like /api/relayer/../v1/admin to escape the /v2 base path.
    if (!SAFE_SEGMENT.test(segment) || segment === "." || segment === "..") {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  }

  let url: URL;
  try {
    url = buildRelayerUrl(path, req.nextUrl.search);
  } catch (err) {
    console.error("[relayer-proxy] invalid RELAYER_URL", err);
    return new Response(JSON.stringify({ error: "Invalid relayer configuration" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: req.method,
      headers: forwardHeaders(req.headers),
      body: req.body,
      // Abort after 30 s so a hanging relayer doesn't block the Next.js server indefinitely.
      signal: AbortSignal.timeout(30_000),
      // @ts-expect-error -- Node fetch supports duplex for streaming bodies
      duplex: "half",
    });
  } catch (err) {
    // Network failure (unreachable host, DNS error, timeout) — return a JSON error so
    // the RelayerWeb worker gets valid JSON instead of an HTML 500 page from Next.js.
    console.error("[relayer-proxy]", url.toString(), err);
    return new Response(JSON.stringify({ error: "Relayer unreachable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const headers = new Headers();
  for (const [key, value] of resp.headers) {
    if (!RESPONSE_DROP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  return new Response(resp.body, { status: resp.status, headers });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, (await params).path);
}
