"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { signerAddressQueryOptions, underlyingAllowanceQueryOptions } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export { underlyingAllowanceQueryOptions };

/** Configuration for {@link useUnderlyingAllowance}. */
export interface UseUnderlyingAllowanceConfig {
  /** Address of the confidential token contract used to scope the query cache. */
  tokenAddress: Address;
  /** Address of the wrapper contract whose underlying ERC-20 allowance is checked. */
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
 *   tokenAddress: "0xConfidentialToken",
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
  const addressQuery = useQuery<Address>({
    ...signerAddressQueryOptions(token.signer),
  });
  const owner = addressQuery.data;

  const baseOpts = underlyingAllowanceQueryOptions(token.signer, tokenAddress, {
    owner,
    wrapperAddress,
  });

  return useQuery<bigint>({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
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
 *   tokenAddress: "0xConfidentialToken",
 *   wrapperAddress: "0xWrapper",
 * });
 * ```
 */
export function useUnderlyingAllowanceSuspense(config: UseUnderlyingAllowanceConfig) {
  const { tokenAddress, wrapperAddress } = config;
  const token = useReadonlyToken(tokenAddress);
  const addressQuery = useSuspenseQuery<Address>({
    ...signerAddressQueryOptions(token.signer),
  });
  const owner = addressQuery.data;

  return useSuspenseQuery<bigint>({
    ...underlyingAllowanceQueryOptions(token.signer, tokenAddress, {
      owner,
      wrapperAddress,
    }),
  });
}
