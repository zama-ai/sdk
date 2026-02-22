"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { ReadonlyToken, type Address } from "@zama-fhe/token-sdk";
import { useTokenSDK } from "../provider";
import { confidentialBalancesQueryKeys, confidentialHandlesQueryKeys } from "./balance-query-keys";

export interface UseConfidentialBalancesOptions extends Omit<
  UseQueryOptions<Map<Address, bigint>, Error>,
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
  tokenAddresses: Address[],
  owner?: Address,
  options?: UseConfidentialBalancesOptions,
) {
  const { handleRefetchInterval, ...balanceOptions } = options ?? {};
  const sdk = useTokenSDK();
  // Resolve the actual owner address to use in query keys.
  // This prevents cache collisions when wallet switches.
  const [resolvedOwner, setResolvedOwner] = useState<Address | undefined>(owner);

  useEffect(() => {
    if (owner) {
      setResolvedOwner(owner);
    } else {
      sdk.signer.getAddress().then(setResolvedOwner);
    }
  }, [owner, sdk.signer]);

  const ownerKey = resolvedOwner ?? "";

  const stableKey = tokenAddresses.join(",");
  const tokens = useMemo(
    () => tokenAddresses.map((addr) => sdk.createReadonlyToken(addr)),
    [sdk, stableKey], // stableKey stabilizes referentially-unstable tokenAddresses arrays
  );

  // Phase 1: Poll all encrypted handles (cheap RPC reads)
  const handlesQuery = useQuery<Address[], Error>({
    queryKey: confidentialHandlesQueryKeys.tokens(tokenAddresses, ownerKey),
    queryFn: () => Promise.all(tokens.map((t) => t.confidentialBalanceOf(resolvedOwner!))),
    enabled: tokenAddresses.length > 0 && !!resolvedOwner,
    refetchInterval: handleRefetchInterval ?? DEFAULT_HANDLE_REFETCH_INTERVAL,
  });

  const handles = handlesQuery.data;
  const handlesKey = handles?.join(",") ?? "";

  // Phase 2: Batch decrypt only when any handle changes
  const balancesQuery = useQuery<Map<Address, bigint>, Error>({
    queryKey: [...confidentialBalancesQueryKeys.tokens(tokenAddresses, ownerKey), handlesKey],
    queryFn: () => ReadonlyToken.batchDecryptBalances(tokens, handles!, resolvedOwner!),
    enabled: tokenAddresses.length > 0 && !!resolvedOwner && !!handles,
    staleTime: Infinity,
    ...balanceOptions,
  });

  return { ...balancesQuery, handlesQuery };
}
