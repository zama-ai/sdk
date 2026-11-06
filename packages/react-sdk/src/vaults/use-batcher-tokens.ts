"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { batcherTokensQueryOptions, type BatcherTokens } from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link useBatcherTokens}. */
export interface UseBatcherTokensConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
  /** Chain to read from, when it is not the connected one. Needs a provider that can route reads, such as `WagmiProvider`. */
  chainId?: number;
}

/** TanStack Query options accepted by {@link useBatcherTokens} (excluding `queryKey`/`queryFn`). */
export interface UseBatcherTokensOptions extends Omit<
  UseQueryOptions<BatcherTokens>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * A batcher's input and output token addresses, read once from the contract.
 * For a deposit batcher, `fromToken` is the vault's confidential asset and
 * `toToken` its confidential share — the addresses `useConfidentialBalance`
 * needs.
 *
 * @param config - The batcher address.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @example
 * ```tsx
 * const { data: tokens } = useBatcherTokens({ address: "0xDepositBatcher" });
 * // tokens?.fromToken: the asset, tokens?.toToken: the share
 * ```
 */
export function useBatcherTokens(
  config: UseBatcherTokensConfig,
  options?: UseBatcherTokensOptions,
) {
  const { enabled = true } = options ?? {};
  const batcher = useVaultBatcher(config.address, { chainId: config.chainId });
  const baseOptions = batcherTokensQueryOptions(batcher);

  return useQuery<BatcherTokens>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
