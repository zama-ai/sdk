"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { confidentialBalanceQueryOptions } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "../token/use-readonly-token";
import { useQuery } from "../utils/query";

export interface UseConfidentialBalanceConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** Account to fetch balance for. The query is disabled while `undefined`. */
  account: Address | undefined;
}

export interface UseConfidentialBalanceOptions extends Omit<
  UseQueryOptions<bigint>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * Hook for fetching a confidential token balance. Reads the on-chain handle and
 * decrypts via the SDK; cached values are returned instantly and the relayer is
 * only hit when the handle changes.
 *
 * @example
 * ```tsx
 * const { data: balance } = useConfidentialBalance({
 *   tokenAddress: "0xToken",
 *   account: "0xAccount",
 * });
 * ```
 */
export function useConfidentialBalance(
  config: UseConfidentialBalanceConfig,
  options?: UseConfidentialBalanceOptions,
) {
  const { tokenAddress, account } = config;
  const { enabled = true } = options ?? {};
  const token = useReadonlyToken(tokenAddress);

  const baseOptions = confidentialBalanceQueryOptions(token, {
    tokenAddress,
    account,
  });

  return useQuery<bigint>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
