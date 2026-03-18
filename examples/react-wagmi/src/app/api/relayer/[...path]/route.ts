import type { NextRequest } from "next/server";

const RELAYER_URL = process.env.RELAYER_URL!;
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;

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
  out.set("x-api-key", RELAYER_API_KEY);
  return out;
}

async function proxy(req: NextRequest, path: string[]) {
  const url = new URL(path.join("/"), RELAYER_URL);
  url.search = req.nextUrl.search;
  const resp = await fetch(url.toString(), {
    method: req.method,
    headers: forwardHeaders(req.headers),
    body: req.body,
    // @ts-expect-error -- Node fetch supports duplex for streaming bodies
    duplex: "half",
  });
  return new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
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
