"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { underlyingAllowanceQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export { underlyingAllowanceQueryOptions };

/** Configuration for {@link useUnderlyingAllowance}. */
export interface UseUnderlyingAllowanceConfig {
  /** Address of the confidential wrapper contract. */
  address: Address;
  /** Owner to fetch allowance for. The query is disabled while `undefined`. */
  owner: Address | undefined;
}

/** Configuration for {@link useUnderlyingAllowanceSuspense}. */
export interface UseUnderlyingAllowanceSuspenseConfig {
  /** Address of the confidential wrapper contract. */
  address: Address;
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
 *   address: "0xWrapper",
 *   owner: "0xOwner",
 * });
 * ```
 */
export function useUnderlyingAllowance(
  config: UseUnderlyingAllowanceConfig,
  options?: Omit<UseQueryOptions<bigint>, "queryKey" | "queryFn">,
) {
  const { address, owner } = config;
  const sdk = useZamaSDK();

  const baseOpts = underlyingAllowanceQueryOptions(sdk, address, { owner });

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
 *   address: "0xWrapper",
 *   owner: "0xOwner",
 * });
 * ```
 */
export function useUnderlyingAllowanceSuspense(config: UseUnderlyingAllowanceSuspenseConfig) {
  const { address, owner } = config;
  const sdk = useZamaSDK();

  return useSuspenseQuery<bigint>(underlyingAllowanceQueryOptions(sdk, address, { owner }));
}
