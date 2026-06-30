import { NextRequest } from "next/server";
import { zamaConfig } from "@/lib/config";

// Disable static caching — all relayer responses are dynamic.
export const dynamic = "force-dynamic";

const RELAYER_BASE = zamaConfig.relayerUrl;
const RELAYER_ORIGIN = new URL(RELAYER_BASE).origin;

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  // Reconstruct target URL and forward any query string the SDK may append.
  const target = new URL(`${RELAYER_BASE}/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  // SSRF guard: reject paths that resolve to a different origin than the relayer base.
  if (target.origin !== RELAYER_ORIGIN) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("Content-Type") ?? "application/json",
  };

  if (process.env.ZAMA_RELAYER_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.ZAMA_RELAYER_API_KEY}`;
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD" ? await request.text() : undefined;

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(target.toString(), { method: request.method, headers, body });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Upstream unreachable";
    return Response.json({ error: message }, { status: 502 });
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}

async function handler(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
