"use client";

import { useMemo } from "react";
import { useQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address, BatchBalancesResult } from "@zama-fhe/sdk";
import { confidentialBalancesQueryOptions, signerAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/** Configuration for {@link useConfidentialBalances}. */
export interface UseConfidentialBalancesConfig {
  /** Addresses of the confidential token contracts to batch-query. */
  tokenAddresses: Address[];
}

/** Query options for {@link useConfidentialBalances}. */
export interface UseConfidentialBalancesOptions extends Omit<
  UseQueryOptions<BatchBalancesResult>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Whether the query is enabled. Callback form is not supported in composite hooks. */
  enabled?: boolean;
}

/**
 * Declarative hook to read multiple confidential token balances in batch.
 * Polls `ReadonlyToken.batchBalancesOf()` at regular intervals. The SDK
 * cache short-circuits decryption for unchanged handles.
 *
 * Returns partial results when some tokens fail — successful balances are
 * always returned alongside per-token error information.
 *
 * @param config - Token addresses and optional polling interval.
 * @param options - React Query options forwarded to the balance query.
 * @returns The balance query result.
 *
 * @example
 * ```tsx
 * const { data } = useConfidentialBalances({
 *   tokenAddresses: ["0xTokenA", "0xTokenB"],
 * });
 * const balance = data?.results.get("0xTokenA");
 * if (data && data.errors.size > 0) {
 *   // some tokens failed — check data.errors
 * }
 * ```
 */
export function useConfidentialBalances(
  config: UseConfidentialBalancesConfig,
  options?: UseConfidentialBalancesOptions,
) {
  const { tokenAddresses } = config;
  const { enabled = true } = options ?? {};
  const sdk = useZamaSDK();

  const addressQuery = useQuery<Address>(signerAddressQueryOptions(sdk.signer));

  const owner = addressQuery.data;

  const tokens = useMemo(
    () => tokenAddresses.map((addr) => sdk.createReadonlyToken(addr)),
    [sdk, tokenAddresses],
  );

  const baseOptions = confidentialBalancesQueryOptions(tokens, {
    owner,
  });

  return useQuery<BatchBalancesResult>({
    ...baseOptions,
    ...options,
    enabled: (baseOptions.enabled ?? true) && enabled,
  });
}
