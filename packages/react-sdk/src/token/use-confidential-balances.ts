"use client";

import { useMemo } from "react";
import { useQuery } from "../utils/query";
import { type UseQueryOptions } from "@tanstack/react-query";
import type { Address, Handle } from "@zama-fhe/sdk";
import {
  confidentialBalancesQueryOptions,
  confidentialHandlesQueryOptions,
  signerAddressQueryOptions,
  type ConfidentialBalancesData,
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

export type { ConfidentialBalancesData };

/** Query options for the decrypt phase of {@link useConfidentialBalances}. */
export type UseConfidentialBalancesOptions = Omit<
  UseQueryOptions<ConfidentialBalancesData, Error>,
  "queryKey" | "queryFn"
>;

/**
 * Declarative hook to read multiple confidential token balances in batch.
 * Uses two-phase polling: cheaply polls encrypted handles, then only
 * decrypts when any handle changes.
 *
 * Returns partial results when some tokens fail — successful balances are
 * always returned alongside per-token error information.
 *
 * @param config - Token addresses and optional polling interval.
 * @param options - React Query options forwarded to the decrypt query.
 * @returns The decrypt query result plus `handlesQuery` for Phase 1 state.
 *
 * @example
 * ```tsx
 * const { data } = useConfidentialBalances({
 *   tokenAddresses: ["0xTokenA", "0xTokenB"],
 * });
 * const balance = data?.balances.get("0xTokenA");
 * if (data?.isPartialError) {
 *   // some tokens failed — check data.errors
 * }
 * ```
 */
export function useConfidentialBalances(
  config: UseConfidentialBalancesConfig,
  options?: UseConfidentialBalancesOptions,
) {
  const { tokenAddresses, handleRefetchInterval, maxConcurrency } = config;
  const userEnabled = options?.enabled;
  const sdk = useZamaSDK();

  const addressQuery = useQuery<Address>({
    ...signerAddressQueryOptions(sdk.signer),
  });

  const owner = addressQuery.data;

  const tokens = useMemo(
    () => tokenAddresses.map((addr) => sdk.createReadonlyToken(addr)),
    [sdk, tokenAddresses],
  );

  // Phase 1: Poll all encrypted handles (cheap RPC reads)
  const baseHandlesQueryOptions = confidentialHandlesQueryOptions(sdk.signer, tokenAddresses, {
    owner,
    pollingInterval: handleRefetchInterval,
  });
  const handlesQuery = useQuery<Handle[]>({
    ...baseHandlesQueryOptions,
    enabled: (baseHandlesQueryOptions.enabled ?? true) && (userEnabled ?? true),
  });

  // Phase 2: Batch decrypt only when any handle changes
  const handles = handlesQuery.data;
  const handlesReady = Array.isArray(handles) && handles.length === tokenAddresses.length;
  const baseBalancesQueryOptions = confidentialBalancesQueryOptions(tokens, {
    owner,
    handles,
    maxConcurrency,
    resultAddresses: tokenAddresses,
  });
  const factoryEnabled = baseBalancesQueryOptions.enabled ?? true;

  const balancesQuery = useQuery<ConfidentialBalancesData>({
    ...baseBalancesQueryOptions,
    ...options,
    enabled: factoryEnabled && handlesReady && (userEnabled ?? true),
  });

  return { ...balancesQuery, handlesQuery };
}
