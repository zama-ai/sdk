"use client";

import { useMemo } from "react";
import { useQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address, BatchBalancesResult } from "@zama-fhe/sdk";
import { confidentialBalancesQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useWalletAccount } from "../utils/wallet-account";

export interface UseConfidentialBalancesConfig {
  /** Addresses of the confidential token contracts to batch-query. The query is disabled while empty. */
  addresses: Address[];
  /** Account to fetch balances for. The query is disabled while `undefined`. */
  account: Address | undefined;
}

export interface UseConfidentialBalancesOptions extends Omit<
  UseQueryOptions<BatchBalancesResult>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * Hook for fetching multiple confidential token balances in batch. Returns
 * partial results when some tokens fail — successful balances are available
 * alongside per-token error information.
 *
 * @param config - Token addresses configuration.
 * @param options - React Query options forwarded to the balance query.
 * @returns The balance query result.
 *
 * @example
 * ```tsx
 * const { data } = useConfidentialBalances({
 *   addresses: ["0xTokenA", "0xTokenB"],
 *   account: "0xAccount",
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
  const { addresses, account } = config;
  const { enabled = true } = options ?? {};
  const sdk = useZamaSDK();
  const walletAccount = useWalletAccount(sdk);

  const tokens = useMemo(() => addresses.map((addr) => sdk.createToken(addr)), [sdk, addresses]);

  const baseOptions = confidentialBalancesQueryOptions(tokens, { account }, { walletAccount });

  return useQuery<BatchBalancesResult>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
