"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { ReadonlyToken, type Hex } from "@zama-fhe/token-sdk";
import { useMemo } from "react";
import { useTokenSDK } from "../provider";
import { confidentialBalancesQueryKeys, confidentialHandlesQueryKeys } from "./balance-query-keys";

export interface UseConfidentialBalancesOptions extends Omit<
  UseQueryOptions<Map<Hex, bigint>, Error>,
  "queryKey" | "queryFn"
> {
  handleRefetchInterval?: number;
}

const DEFAULT_HANDLE_REFETCH_INTERVAL = 10_000;

/**
 * Declarative hook to read multiple confidential token balances in batch.
 * Uses two-phase polling: cheaply polls encrypted handles, then only
 * decrypts when any handle changes.
 */
export function useConfidentialBalances(
  tokenAddresses: Hex[],
  owner?: Hex,
  options?: UseConfidentialBalancesOptions,
) {
  const sdk = useTokenSDK();
  const { handleRefetchInterval, ...balanceOptions } = options ?? {};

  const tokens = useMemo(
    () => tokenAddresses.map((addr) => sdk.createReadonlyToken(addr)),
    [sdk, tokenAddresses],
  );

  // Phase 1: Poll all encrypted handles (cheap RPC reads)
  const handlesQuery = useQuery<Hex[], Error>({
    queryKey: confidentialHandlesQueryKeys.tokens(tokenAddresses, owner ?? ""),
    queryFn: async () => {
      const ownerAddress = owner ?? (await sdk.signer.getAddress());
      return Promise.all(tokens.map((t) => t.confidentialBalanceOf(ownerAddress)));
    },
    enabled: tokenAddresses.length > 0,
    refetchInterval: handleRefetchInterval ?? DEFAULT_HANDLE_REFETCH_INTERVAL,
  });

  const handles = handlesQuery.data;
  const handlesKey = handles?.join(",") ?? "";

  // Phase 2: Batch decrypt only when any handle changes
  const balancesQuery = useQuery<Map<Hex, bigint>, Error>({
    queryKey: [...confidentialBalancesQueryKeys.tokens(tokenAddresses, owner ?? ""), handlesKey],
    queryFn: async () => {
      const ownerAddress = owner ?? (await sdk.signer.getAddress());
      return ReadonlyToken.batchDecryptBalances(tokens, handles!, ownerAddress);
    },
    enabled: tokenAddresses.length > 0 && handles !== undefined,
    staleTime: Infinity,
    ...balanceOptions,
  });

  return { ...balancesQuery, handlesQuery };
}
