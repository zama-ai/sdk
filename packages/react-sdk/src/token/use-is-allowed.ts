"use client";

import { useQuery } from "@tanstack/react-query";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

export const isAllowedQueryKeys = {
  all: ["zama", "isAllowed"] as const,
};

export function isAllowedQueryOptions(sdk: ZamaSDK) {
  return {
    queryKey: isAllowedQueryKeys.all,
    queryFn: () => sdk.isAllowed(),
  };
}

/**
 * Check whether a session signature is cached for the connected wallet.
 * Returns `true` if decrypt operations can proceed without a wallet prompt.
 *
 * @example
 * ```tsx
 * const { data: allowed } = useIsAllowed();
 * ```
 */
export function useIsAllowed() {
  const sdk = useZamaSDK();

  return useQuery<boolean, Error>(isAllowedQueryOptions(sdk));
}
