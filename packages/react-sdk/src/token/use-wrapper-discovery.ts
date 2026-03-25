"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { wrapperDiscoveryQueryOptions } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export { wrapperDiscoveryQueryOptions };

/** Configuration for {@link useWrapperDiscovery}. */
export interface UseWrapperDiscoveryConfig {
  /**
   * Address of any confidential token you control.
   * Used only to derive the signer context and to scope the query cache key —
   * it does not affect which wrapper the registry returns.
   */
  tokenAddress: Address;
  /** ERC-20 address to discover the wrapper for. Pass `undefined` to disable the query. */
  erc20Address: Address | undefined;
  /**
   * Optional per-chain registry address overrides.
   * Useful for local development chains (e.g. Hardhat) where no default registry is deployed.
   */
  registryAddresses?: Record<number, Address>;
}

/** Configuration for {@link useWrapperDiscoverySuspense}. */
export interface UseWrapperDiscoverySuspenseConfig {
  /**
   * Address of any confidential token you control.
   * Used only to derive the signer context and to scope the query cache key —
   * it does not affect which wrapper the registry returns.
   */
  tokenAddress: Address;
  /** ERC-20 address to discover the wrapper for. */
  erc20Address: Address;
}

/**
 * Discover the confidential wrapper for an ERC-20 token via the on-chain registry.
 * Returns the wrapper address if one exists, or `null` if not.
 * Cached indefinitely since wrapper mappings are immutable.
 *
 * @param config - Token and ERC-20 addresses.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: Address | null`.
 *
 * @example
 * ```tsx
 * const { data: wrapperAddress } = useWrapperDiscovery({
 *   tokenAddress: "0xConfidentialToken",
 *   erc20Address: "0xUSDC",
 * });
 * ```
 */
export function useWrapperDiscovery(
  config: UseWrapperDiscoveryConfig,
  options?: Omit<UseQueryOptions<Address | null>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, erc20Address, registryAddresses } = config;
  const token = useReadonlyToken(tokenAddress);
  const baseOpts = wrapperDiscoveryQueryOptions(token.signer, tokenAddress, {
    erc20Address,
    registryAddresses,
  });

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
 * @param config - Token and ERC-20 addresses.
 * @returns Suspense query result with `data: Address | null`.
 *
 * @example
 * ```tsx
 * const { data: wrapperAddress } = useWrapperDiscoverySuspense({
 *   tokenAddress: "0xConfidentialToken",
 *   erc20Address: "0xUSDC",
 * });
 * ```
 */
export function useWrapperDiscoverySuspense(config: UseWrapperDiscoverySuspenseConfig) {
  const { tokenAddress, erc20Address } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<Address | null>({
    ...wrapperDiscoveryQueryOptions(token.signer, tokenAddress, {
      erc20Address,
    }),
  });
}
