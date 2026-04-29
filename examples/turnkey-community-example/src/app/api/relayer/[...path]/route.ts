import { NextRequest } from "next/server";
import { MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";

// Disable static caching — all relayer responses are dynamic.
export const dynamic = "force-dynamic";

const RELAYER_BASE =
  process.env.NEXT_PUBLIC_CHAIN === "mainnet" ? MainnetConfig.relayerUrl : SepoliaConfig.relayerUrl;

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  // Reconstruct target URL and forward any query string the SDK may append.
  const target = new URL(`${RELAYER_BASE}/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("Content-Type") ?? "application/json",
  };

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
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path);
}
