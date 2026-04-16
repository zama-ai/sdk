"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { confidentialBalanceQueryOptions, signerAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useReadonlyToken } from "../token/use-readonly-token";
import { useQuery } from "../utils/query";

/** Configuration for {@link useConfidentialBalance}. */
export interface UseConfidentialBalanceConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** Polling interval (ms) for the balance. Default: 10 000. */
  pollingInterval?: number;
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
 * Polls `token.balanceOf(owner)` at regular intervals. The SDK cache
 * short-circuits decryption when the on-chain handle is unchanged.
 *
 * @param config - Token address and optional polling interval.
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
  const { tokenAddress, pollingInterval } = config;
  const { enabled = true } = options ?? {};
  const sdk = useZamaSDK();
  const token = useReadonlyToken(tokenAddress);

  const addressQuery = useQuery<Address>(signerAddressQueryOptions(sdk.signer));

  const owner = addressQuery.data;

  const baseOptions = confidentialBalanceQueryOptions(token, {
    tokenAddress,
    owner,
    pollingInterval,
  });

  return useQuery<bigint>({
    ...baseOptions,
    ...options,
    enabled: baseOptions.enabled && enabled,
  });
}
