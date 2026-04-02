"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { delegationStatusQueryOptions, type DelegationStatusData } from "@zama-fhe/sdk/query";
import { useQuery } from "../utils/query";
import { useZamaSDK } from "../provider";

export interface UseDelegationStatusConfig {
  /** Address of the confidential token contract. Pass `undefined` to disable the query. */
  tokenAddress: Address | undefined;
  /** The address that granted the delegation. */
  delegatorAddress?: Address;
  /** The address that received delegation rights. */
  delegateAddress?: Address;
}

/**
 * Query delegation status between a delegator and delegate for a token.
 *
 * @param config - Token address, delegator, and delegate addresses.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns `{ isDelegated, expiryTimestamp, isLoading, error }`.
 *
 * @example
 * ```tsx
 * const { data } = useDelegationStatus({
 *   tokenAddress: "0xToken",
 *   delegatorAddress: "0xDelegator",
 *   delegateAddress: "0xDelegate",
 * });
 * // data?.isDelegated, data?.expiryTimestamp
 * ```
 */
export function useDelegationStatus(
  config: UseDelegationStatusConfig,
  options?: Omit<UseQueryOptions<DelegationStatusData>, "queryKey" | "queryFn">,
) {
  const sdk = useZamaSDK();
  const baseOpts = delegationStatusQueryOptions(sdk, {
    tokenAddress: config.tokenAddress,
    delegatorAddress: config.delegatorAddress,
    delegateAddress: config.delegateAddress,
  });

  return useQuery<DelegationStatusData>({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}
