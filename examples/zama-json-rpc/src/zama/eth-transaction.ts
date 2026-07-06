import type { Address, Hex } from "viem";

export interface EthTransactionParams {
  from?: Address;
  to?: Address;
  data?: Hex;
  [key: string]: unknown;
}

function isHexString(value: unknown): value is `0x${string}` {
  return typeof value === "string" && value.startsWith("0x");
}

/**
 * Parses the first param of an `eth_sendTransaction` request.
 *
 * Deliberately narrow: only understands the `data` field for calldata (not
 * `input`, which some clients send instead — see WALKTHROUGH.md for why
 * that's a known v1 limitation rather than handled here).
 */
export function parseEthTransactionParams(raw: unknown): EthTransactionParams {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const candidate = raw as Record<string, unknown>;
  return {
    ...candidate,
    from: isHexString(candidate.from) ? (candidate.from as Address) : undefined,
    to: isHexString(candidate.to) ? (candidate.to as Address) : undefined,
    data: isHexString(candidate.data) ? (candidate.data as Hex) : undefined,
  };
}
