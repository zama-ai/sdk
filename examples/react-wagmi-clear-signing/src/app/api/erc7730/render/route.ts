import { NextResponse } from "next/server";
import { isAddress, isHex } from "viem";
import { renderLocalErc7730Call, type Erc7730RenderRequestCall } from "@/lib/erc7730-sourcify";

export const runtime = "nodejs";

interface RenderBody {
  calls?: Erc7730RenderRequestCall[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as RenderBody;
  const calls = body.calls ?? [];

  if (!Array.isArray(calls)) {
    return NextResponse.json({ error: "calls must be an array" }, { status: 400 });
  }

  const invalid = calls.find(
    (call) =>
      typeof call.chainId !== "number" ||
      !isAddress(call.to) ||
      !isHex(call.data) ||
      (call.value !== undefined && !/^\d+$/.test(call.value)),
  );

  if (invalid) {
    return NextResponse.json({ error: "invalid ERC-7730 render call" }, { status: 400 });
  }

  const previews = await Promise.all(calls.map(renderLocalErc7730Call));
  return NextResponse.json({ previews });
}
