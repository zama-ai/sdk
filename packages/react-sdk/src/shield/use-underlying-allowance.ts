"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { underlyingAllowanceQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export { underlyingAllowanceQueryOptions };

export interface UseUnderlyingAllowanceConfig {
  /** Address of the confidential token contract used to scope the query cache. */
  tokenAddress: Address;
  /** Address of the wrapper contract whose underlying ERC-20 allowance is checked. */
  wrapperAddress: Address;
  /** Owner to fetch allowance for. The query is disabled while `undefined`. */
  owner: Address | undefined;
}

export interface UseUnderlyingAllowanceSuspenseConfig {
  /** Address of the confidential token contract used to scope the query cache. */
  tokenAddress: Address;
  /** Address of the wrapper contract whose underlying ERC-20 allowance is checked. */
  wrapperAddress: Address;
  /** Owner to fetch allowance for. */
  owner: Address;
}

/**
 * Hook for fetching the underlying ERC-20 allowance granted to the wrapper
 * contract. Useful to check if an approval is needed before shielding.
 *
 * @example
 * ```tsx
 * const { data: allowance } = useUnderlyingAllowance({
 *   tokenAddress: "0xConfidentialToken",
 *   wrapperAddress: "0xWrapper",
 *   owner: "0xOwner",
 * });
 * ```
 */
export function useUnderlyingAllowance(
  config: UseUnderlyingAllowanceConfig,
  options?: Omit<UseQueryOptions<bigint>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, wrapperAddress, owner } = config;
  const sdk = useZamaSDK();

  const baseOpts = underlyingAllowanceQueryOptions(sdk, tokenAddress, {
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
 * Suspense variant of {@link useUnderlyingAllowance}. Suspends rendering until
 * the allowance resolves.
 *
 * @example
 * ```tsx
 * const { data: allowance } = useUnderlyingAllowanceSuspense({
 *   tokenAddress: "0xConfidentialToken",
 *   wrapperAddress: "0xWrapper",
 *   owner: "0xOwner",
 * });
 * ```
 */
export function useUnderlyingAllowanceSuspense(config: UseUnderlyingAllowanceSuspenseConfig) {
  const { tokenAddress, wrapperAddress, owner } = config;
  const sdk = useZamaSDK();

  return useSuspenseQuery<bigint>(
    underlyingAllowanceQueryOptions(sdk, tokenAddress, {
      owner,
      wrapperAddress,
    }),
  );
}
