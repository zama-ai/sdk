"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link ReadonlyToken} instance, memoized by address.
 * Provider-only reads: metadata (name, symbol, decimals), encrypted handle
 * lookup (confidentialBalanceOf), ERC-165 checks, underlying token, and
 * allowance. Reads signer and storage from the nearest {@link ZamaProvider}.
 *
 * For decrypt operations, credential management, or delegation queries,
 * use {@link useToken} instead.
 *
 * @param address - Address of the confidential token contract.
 * @returns A memoized `ReadonlyToken` instance.
 *
 * @example
 * ```tsx
 * const token = useReadonlyToken("0xToken");
 * // token.confidentialBalanceOf(), token.isConfidential(), token.name(), etc.
 * ```
 */
export function useReadonlyToken(address: Address) {
  const sdk = useZamaSDK();

  return useMemo(() => sdk.createReadonlyToken(address), [sdk, address]);
}
