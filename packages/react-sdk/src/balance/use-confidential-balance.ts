"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { confidentialBalanceQueryOptions } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "../token/use-readonly-token";
import { useQuery } from "../utils/query";
import { useSignerAddress } from "../use-signer-address";

/** Configuration for {@link useConfidentialBalance}. */
export interface UseConfidentialBalanceConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
}

/** Query options for {@link useConfidentialBalance}. */
export interface UseConfidentialBalanceOptions extends Omit<
  UseQueryOptions<bigint>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Whether the query is enabled. Callback form is not supported in composite hooks. */
  enabled?: boolean;
}

/**
 * Declarative hook to read the connected wallet's confidential token balance.
 * Calls `token.balanceOf(owner)` which reads the on-chain handle and decrypts
 * via the SDK. Cached values are returned instantly — the relayer is only hit
 * when the handle changes.
 *
 * @param config - Token address configuration.
 * @param options - React Query options forwarded to the balance query.
 * @returns The balance query result.
 *
 * @example
 * ```tsx
 * const { data: balance, isLoading } = useConfidentialBalance({
 *   tokenAddress: "0x...",
 * });
 * ```
 */
export function useConfidentialBalance(
  config: UseConfidentialBalanceConfig,
  options?: UseConfidentialBalanceOptions,
) {
  const { tokenAddress } = config;
  const { enabled = true } = options ?? {};
  const token = useReadonlyToken(tokenAddress);
  const owner = useSignerAddress();

  const baseOptions = confidentialBalanceQueryOptions(token, {
    tokenAddress,
    owner,
  });

  return useQuery<bigint>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled && owner !== undefined,
  });
}
