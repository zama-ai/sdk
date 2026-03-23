import type { NextRequest } from "next/server";

// Default to the public Sepolia testnet relayer — no API key required.
// For production or private deployments, set RELAYER_URL and RELAYER_API_KEY in .env.local.
const RELAYER_URL = process.env.RELAYER_URL ?? "https://relayer.testnet.zama.org/v2";
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

function forwardHeaders(incoming: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of incoming) {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "host") {
      out.set(key, value);
    }
  }
  if (RELAYER_API_KEY) {
    out.set("x-api-key", RELAYER_API_KEY);
  }
  return out;
}

// Headers that must not be forwarded from the relayer response back to the browser.
// Node.js fetch() auto-decompresses gzip/brotli bodies, so re-forwarding content-encoding
// would cause the browser to attempt a second decompression pass, producing garbage.
const RESPONSE_DROP = new Set(["content-encoding", "content-length", "transfer-encoding"]);

async function proxy(req: NextRequest, path: string[]) {
  const url = new URL(path.join("/"), RELAYER_URL + "/");
  url.search = req.nextUrl.search;

  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      method: req.method,
      headers: forwardHeaders(req.headers),
      body: req.body,
      // @ts-expect-error -- Node fetch supports duplex for streaming bodies
      duplex: "half",
    });
  } catch {
    // Network failure (unreachable host, DNS error, timeout) — return a JSON error so
    // the RelayerWeb worker gets valid JSON instead of an HTML 500 page from Next.js.
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
