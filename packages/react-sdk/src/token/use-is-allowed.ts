"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { hashFn, isAllowedQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

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

  return useQuery({
    ...isAllowedQueryOptions(sdk),
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<boolean, Error>);
}
