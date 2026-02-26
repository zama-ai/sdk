"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, ZamaSDK } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

export const isAllowedQueryKeys = {
  all: ["zama", "isAllowed"] as const,
  token: (tokenAddress: Address) => [...isAllowedQueryKeys.all, tokenAddress] as const,
};

export function isAllowedQueryOptions(sdk: ZamaSDK, tokenAddress: Address) {
  return {
    queryKey: isAllowedQueryKeys.token(tokenAddress),
    queryFn: () => sdk.createReadonlyToken(tokenAddress).isAllowed(),
  };
}

/**
 * Check whether a session signature is cached for the given token.
 * Returns `true` if decrypt operations can proceed without a wallet prompt.
 *
 * @param tokenAddress - The confidential token contract address.
 *
 * @example
 * ```tsx
 * const { data: allowed } = useIsTokenAllowed("0x...");
 * ```
 */
export function useIsTokenAllowed(tokenAddress: Address) {
  const sdk = useZamaSDK();

  return useQuery<boolean, Error>(isAllowedQueryOptions(sdk, tokenAddress));
}
