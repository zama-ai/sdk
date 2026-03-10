"use client";

import { skipToken } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  delegationStatusQueryOptions,
  zamaQueryKeys,
  type DelegationStatusData,
} from "@zama-fhe/sdk/query";
import { useQuery } from "../utils/query";
import { useReadonlyToken } from "./use-readonly-token";

export interface UseDelegationStatusConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** The address that granted the delegation. */
  delegator?: Address;
  /** The address that received delegation rights. */
  delegate?: Address;
}

/**
 * Query delegation status between a delegator and delegate for a token.
 *
 * @param config - Token address, delegator, and delegate addresses.
 * @returns `{ isDelegated, expiryTimestamp, isLoading, error }`.
 *
 * @example
 * ```tsx
 * const { data } = useDelegationStatus({
 *   tokenAddress: "0xToken",
 *   delegator: "0xDelegator",
 *   delegate: "0xDelegate",
 * });
 * // data?.isDelegated, data?.expiryTimestamp
 * ```
 */
export function useDelegationStatus(config: UseDelegationStatusConfig) {
  const readonlyToken = useReadonlyToken(config.tokenAddress);

  const enabled = Boolean(config.delegator && config.delegate);
  const baseOpts =
    config.delegator && config.delegate
      ? delegationStatusQueryOptions(readonlyToken, {
          delegator: config.delegator,
          delegate: config.delegate,
        })
      : {
          queryKey: zamaQueryKeys.delegationStatus.all,
          queryFn: skipToken as unknown as () => Promise<DelegationStatusData>,
        };

  return useQuery<DelegationStatusData>({
    ...baseOpts,
    enabled,
  });
}
