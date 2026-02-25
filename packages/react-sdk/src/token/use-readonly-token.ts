"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link ReadonlyToken} instance, memoized by address.
 * Supports balance queries, ERC-165 checks, and authorization — no wrapper needed.
 * Reads signer and storage from the nearest {@link ZamaProvider}.
 *
 * @param address - Address of the confidential token contract.
 * @returns A memoized `ReadonlyToken` instance.
 *
 * @example
 * ```tsx
 * const token = useReadonlyToken("0xToken");
 * // token.balanceOf(), token.isConfidential(), etc.
 * ```
 */
export function useReadonlyToken(address: Address) {
  const sdk = useZamaSDK();

  return useMemo(() => sdk.createReadonlyToken(address), [sdk, address]);
}
