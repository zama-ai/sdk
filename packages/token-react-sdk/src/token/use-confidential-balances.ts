"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { ReadonlyToken, type Address } from "@zama-fhe/token-sdk";
import { useTokenSDK } from "../provider";
import { confidentialBalancesQueryKeys, confidentialHandlesQueryKeys } from "./balance-query-keys";

/** Configuration for {@link useConfidentialBalances}. */
export interface UseConfidentialBalancesConfig {
  /** Addresses of the confidential token contracts to batch-query. */
  tokenAddresses: Address[];
  /** Polling interval (ms) for the encrypted handles. Default: 10 000. */
  handleRefetchInterval?: number;
}

/** Query options for the decrypt phase of {@link useConfidentialBalances}. */
export type UseConfidentialBalancesOptions = Omit<
  UseQueryOptions<Map<Address, bigint>, Error>,
  "queryKey" | "queryFn"
>;

const DEFAULT_HANDLE_REFETCH_INTERVAL = 10_000;

/**
 * Declarative hook to read multiple confidential token balances in batch.
 * Uses two-phase polling: cheaply polls encrypted handles, then only
 * decrypts when any handle changes.
 *
 * @param config - Token addresses and optional polling interval.
 * @param options - React Query options forwarded to the decrypt query.
 * @returns The decrypt query result (Map of address → balance) plus `handlesQuery` for Phase 1 state.
 *
 * @example
 * ```tsx
 * const { data: balances } = useConfidentialBalances({
 *   tokenAddresses: ["0xTokenA", "0xTokenB"],
 * });
 * const balance = balances?.get("0xTokenA");
 * ```
 */
export function useConfidentialBalances(
  config: UseConfidentialBalancesConfig,
  options?: UseConfidentialBalancesOptions,
) {
  const { tokenAddresses, handleRefetchInterval } = config;
  const sdk = useTokenSDK();
  // Resolve the signer address for stable query keys.
  // This prevents cache collisions when wallet switches.
  const [signerAddress, setSignerAddress] = useState<Address | undefined>();

  useEffect(() => {
    sdk.signer.getAddress().then(setSignerAddress);
  }, [sdk.signer]);

  const ownerKey = signerAddress ?? "";

  const stableKey = tokenAddresses.join(",");
  const tokens = useMemo(
    () => tokenAddresses.map((addr) => sdk.createReadonlyToken(addr)),
    [sdk, stableKey], // stableKey stabilizes referentially-unstable tokenAddresses arrays
  );

  // Phase 1: Poll all encrypted handles (cheap RPC reads)
  const handlesQuery = useQuery<Address[], Error>({
    queryKey: confidentialHandlesQueryKeys.tokens(tokenAddresses, ownerKey),
    queryFn: () => Promise.all(tokens.map((t) => t.confidentialBalanceOf())),
    enabled: tokenAddresses.length > 0 && !!signerAddress,
    refetchInterval: handleRefetchInterval ?? DEFAULT_HANDLE_REFETCH_INTERVAL,
  });

  const handles = handlesQuery.data;
  const handlesKey = handles?.join(",") ?? "";

  // Phase 2: Batch decrypt only when any handle changes
  const balancesQuery = useQuery<Map<Address, bigint>, Error>({
    queryKey: [...confidentialBalancesQueryKeys.tokens(tokenAddresses, ownerKey), handlesKey],
    queryFn: () => ReadonlyToken.batchDecryptBalances(tokens, handles!),
    enabled: tokenAddresses.length > 0 && !!signerAddress && !!handles,
    staleTime: Infinity,
    ...options,
  });

  return { ...balancesQuery, handlesQuery };
}
