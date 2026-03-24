"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { wrapperDiscoveryQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useReadonlyToken } from "./use-readonly-token";

export { wrapperDiscoveryQueryOptions };

/** Configuration for {@link useWrapperDiscovery}. */
export interface UseWrapperDiscoveryConfig {
  /** Address of the underlying ERC-20 token. Pass `undefined` to disable the query. */
  tokenAddress: Address | undefined;
  /** Address of the wrapper coordinator. Pass `undefined` to disable the query. */
  coordinatorAddress: Address | undefined;
}

/** Configuration for {@link useWrapperDiscoverySuspense}. */
export interface UseWrapperDiscoverySuspenseConfig {
  /** Address of the underlying ERC-20 token. */
  tokenAddress: Address;
  /** Address of the wrapper coordinator. */
  coordinatorAddress: Address;
}

/**
 * Discover the wrapper contract for an ERC-20 token.
 * Returns the wrapper address if one exists, or `null` if not.
 * Cached indefinitely since wrapper mappings are immutable.
 *
 * @param config - Token and coordinator addresses.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: Address | null`.
 *
 * @example
 * ```tsx
 * const { data: wrapperAddress } = useWrapperDiscovery({
 *   tokenAddress: "0xUnderlying",
 *   coordinatorAddress: "0xCoordinator",
 * });
 * ```
 */
export function useWrapperDiscovery(
  config: UseWrapperDiscoveryConfig,
  options?: Omit<UseQueryOptions<Address | null>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, coordinatorAddress } = config;
  const sdk = useZamaSDK();
  const baseOpts = wrapperDiscoveryQueryOptions(sdk.signer, tokenAddress, { coordinatorAddress });

  return useQuery<Address | null>({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}

/**
 * Suspense variant of {@link useWrapperDiscovery}.
 * Suspends rendering until the wrapper address is resolved.
 *
 * @param config - Token and coordinator addresses.
 * @returns Suspense query result with `data: Address | null`.
 *
 * @example
 * ```tsx
 * const { data: wrapperAddress } = useWrapperDiscoverySuspense({
 *   tokenAddress: "0xUnderlying",
 *   coordinatorAddress: "0xCoordinator",
 * });
 * ```
 */
export function useWrapperDiscoverySuspense(config: UseWrapperDiscoverySuspenseConfig) {
  const { tokenAddress, coordinatorAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<Address | null>({
    ...wrapperDiscoveryQueryOptions(token.signer, tokenAddress, { coordinatorAddress }),
  });
}
