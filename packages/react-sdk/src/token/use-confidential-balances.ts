"use client";

import { useMemo } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  confidentialBalancesQueryOptions,
  confidentialHandlesQueryOptions,
  hashFn,
  signerAddressQueryOptions,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/** Configuration for {@link useConfidentialBalances}. */
export interface UseConfidentialBalancesConfig {
  /** Addresses of the confidential token contracts to batch-query. */
  tokenAddresses: Address[];
  /** Polling interval (ms) for the encrypted handles. Default: 10 000. */
  handleRefetchInterval?: number;
  /** Maximum number of concurrent decrypt calls. Default: `Infinity` (no limit). */
  maxConcurrency?: number;
}

/** Query options for the decrypt phase of {@link useConfidentialBalances}. */
export type UseConfidentialBalancesOptions = Omit<
  UseQueryOptions<Map<Address, bigint>, Error>,
  "queryKey" | "queryFn"
>;

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
  const { tokenAddresses, handleRefetchInterval, maxConcurrency } = config;
  const sdk = useZamaSDK();
  const signerAddressToken =
    tokenAddresses[0] ?? ("0x0000000000000000000000000000000000000000" as Address);

  const addressQuery = useQuery({
    ...signerAddressQueryOptions(sdk.signer, signerAddressToken),
    queryKeyHashFn: hashFn,
  });

  const owner = addressQuery.data as Address | undefined;

  const tokens = useMemo(
    () => tokenAddresses.map((addr) => sdk.createReadonlyToken(addr)),
    [sdk, tokenAddresses],
  );

  // Phase 1: Poll all encrypted handles (cheap RPC reads)
  const handlesQuery = useQuery({
    ...confidentialHandlesQueryOptions(sdk.signer, tokenAddresses, {
      owner,
      pollingInterval: handleRefetchInterval,
    }),
    queryKeyHashFn: hashFn,
  });

  // Phase 2: Batch decrypt only when any handle changes
  const handles = handlesQuery.data as Address[] | undefined;
  const baseBalancesQueryOptions = confidentialBalancesQueryOptions(tokens, {
    owner,
    handles,
    maxConcurrency,
  });
  const factoryEnabled = baseBalancesQueryOptions.enabled ?? true;
  const userEnabled = options?.enabled;
  const handlesReady = Array.isArray(handles) && handles.length === tokenAddresses.length;

  const balancesQuery = useQuery({
    ...baseBalancesQueryOptions,
    ...options,
    enabled: factoryEnabled && handlesReady && (userEnabled ?? true),
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<Map<Address, bigint>, Error>);

  return { ...balancesQuery, handlesQuery };
}
