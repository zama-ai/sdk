"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  confidentialBalanceQueryOptions,
  confidentialHandleQueryOptions,
  hashFn,
  signerAddressQueryOptions,
} from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

/** Configuration for {@link useConfidentialBalance}. */
export interface UseConfidentialBalanceConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** Polling interval (ms) for the encrypted handle. Default: 10 000. */
  handleRefetchInterval?: number;
}

/** Query options for the decrypt phase of {@link useConfidentialBalance}. */
export type UseConfidentialBalanceOptions = Omit<
  UseQueryOptions<bigint, Error>,
  "queryKey" | "queryFn"
>;

/**
 * Declarative hook to read the connected wallet's confidential token balance.
 * Uses two-phase polling: cheaply polls the encrypted handle, then only
 * decrypts when the handle changes (new balance).
 *
 * @param config - Token address and optional polling interval.
 * @param options - React Query options forwarded to the decrypt query.
 * @returns The decrypt query result plus `handleQuery` for Phase 1 state.
 *
 * @example
 * ```tsx
 * const { data: balance, isLoading, handleQuery } = useConfidentialBalance({
 *   tokenAddress: "0x...",
 * });
 * ```
 */
export function useConfidentialBalance(
  config: UseConfidentialBalanceConfig,
  options?: UseConfidentialBalanceOptions,
) {
  const { tokenAddress, handleRefetchInterval } = config;
  const token = useReadonlyToken(tokenAddress);

  const addressQuery = useQuery({
    ...signerAddressQueryOptions(token.signer, tokenAddress),
    queryKeyHashFn: hashFn,
  });

  const owner = addressQuery.data as Address | undefined;

  // Phase 1: Poll the encrypted handle (cheap RPC read, no signing)
  const handleQuery = useQuery({
    ...confidentialHandleQueryOptions(token.signer, tokenAddress, {
      owner,
      pollingInterval: handleRefetchInterval,
    }),
    queryKeyHashFn: hashFn,
  });

  // Phase 2: Decrypt only when handle changes (expensive relayer roundtrip)
  const balanceQuery = useQuery({
    ...confidentialBalanceQueryOptions(token, {
      handle: handleQuery.data as Address | undefined,
      owner,
    }),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<bigint, Error>);

  return { ...balanceQuery, handleQuery };
}
