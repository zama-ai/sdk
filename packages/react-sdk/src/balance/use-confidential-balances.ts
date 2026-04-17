"use client";

import { useMemo } from "react";
import { useQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address, BatchBalancesResult } from "@zama-fhe/sdk";
import { confidentialBalancesQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useSignerAddress } from "../use-signer-address";

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
 * Calls `ReadonlyToken.batchBalancesOf()` which decrypts each token via the
 * SDK. Cached values are returned instantly — the relayer is only hit for
 * changed handles.
 *
 * Returns partial results when some tokens fail — successful balances are
 * always returned alongside per-token error information.
 *
 * @param config - Token addresses configuration.
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
  const owner = useSignerAddress();

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
    enabled: Boolean(baseOptions.enabled) && enabled && owner !== undefined,
  });
}
