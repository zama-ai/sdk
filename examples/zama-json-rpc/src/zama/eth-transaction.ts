import type { Address, Hex } from "viem";

export interface EthTransactionParams {
  from?: Address;
  to?: Address;
  data?: Hex;
  /** Alias some clients send instead of `data`. See `parseEthTransactionParams`. */
  input?: Hex;
  [key: string]: unknown;
}

function isHexString(value: unknown): value is `0x${string}` {
  return typeof value === "string" && value.startsWith("0x");
}

/**
 * Parses the first param of an `eth_sendTransaction` / `eth_call` /
 * `eth_estimateGas` request.
 *
 * Accepts calldata under either `data` or `input` — some clients send
 * `input` instead of `data` (both are long-standing accepted names for the
 * same field; `input` is go-ethereum's preferred name in newer versions).
 * `data` wins if both are present, matching most nodes' own precedence.
 */
export function parseEthTransactionParams(raw: unknown): EthTransactionParams {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const candidate = raw as Record<string, unknown>;
  const data = isHexString(candidate.data)
    ? (candidate.data as Hex)
    : isHexString(candidate.input)
      ? (candidate.input as Hex)
      : undefined;

  return {
    ...candidate,
    from: isHexString(candidate.from) ? (candidate.from as Address) : undefined,
    to: isHexString(candidate.to) ? (candidate.to as Address) : undefined,
    data,
    input: isHexString(candidate.input) ? (candidate.input as Hex) : undefined,
  };
}
