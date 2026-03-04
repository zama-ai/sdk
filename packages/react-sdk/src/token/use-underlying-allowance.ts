"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  hashFn,
  signerAddressQueryOptions,
  underlyingAllowanceQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export const underlyingAllowanceQueryKeys = zamaQueryKeys.underlyingAllowance;
export { underlyingAllowanceQueryOptions };

/** Configuration for {@link useUnderlyingAllowance}. */
export interface UseUnderlyingAllowanceConfig {
  /** Address of the underlying ERC-20 token. */
  tokenAddress: Address;
  /** Address of the wrapper contract (the spender). */
  wrapperAddress: Address;
}

/**
 * Read the underlying ERC-20 allowance granted to the wrapper contract.
 * Useful to check if an approval is needed before shielding.
 *
 * @param config - Token and wrapper addresses.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: bigint` (current allowance).
 *
 * @example
 * ```tsx
 * const { data: allowance } = useUnderlyingAllowance({
 *   tokenAddress: "0xUnderlying",
 *   wrapperAddress: "0xWrapper",
 * });
 * ```
 */
export function useUnderlyingAllowance(
  config: UseUnderlyingAllowanceConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, wrapperAddress } = config;
  const token = useReadonlyToken(tokenAddress);
  const addressQuery = useQuery({
    ...signerAddressQueryOptions(token.signer, tokenAddress),
    queryKeyHashFn: hashFn,
  });
  const owner = addressQuery.data as Address | undefined;

  return useQuery({
    ...underlyingAllowanceQueryOptions(token.signer, tokenAddress, {
      owner,
      wrapperAddress,
    }),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<bigint, Error>);
}

/**
 * Suspense variant of {@link useUnderlyingAllowance}.
 * Suspends rendering until the allowance is loaded.
 *
 * @param config - Token and wrapper addresses.
 * @returns Suspense query result with `data: bigint`.
 *
 * @example
 * ```tsx
 * const { data: allowance } = useUnderlyingAllowanceSuspense({
 *   tokenAddress: "0xUnderlying",
 *   wrapperAddress: "0xWrapper",
 * });
 * ```
 */
export function useUnderlyingAllowanceSuspense(config: UseUnderlyingAllowanceConfig) {
  const { tokenAddress, wrapperAddress } = config;
  const token = useReadonlyToken(tokenAddress);
  const addressQuery = useSuspenseQuery({
    ...signerAddressQueryOptions(token.signer, tokenAddress),
    queryKeyHashFn: hashFn,
  });
  const owner = addressQuery.data as Address;

  return useSuspenseQuery({
    ...underlyingAllowanceQueryOptions(token.signer, tokenAddress, {
      owner,
      wrapperAddress,
    }),
    queryKeyHashFn: hashFn,
  });
}
