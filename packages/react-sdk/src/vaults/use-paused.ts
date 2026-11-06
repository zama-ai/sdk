"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { pausedQueryOptions } from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultBatcher } from "./use-vault-batcher";

/** Configuration for {@link usePaused}. */
export interface UsePausedConfig {
  /** The batcher contract address (deposit or redeem direction). */
  address: Address;
  /** Chain to read from, when it is not the connected one. Needs a provider that can route reads, such as `WagmiProvider`. */
  chainId?: number;
}

/** TanStack Query options accepted by {@link usePaused} (excluding `queryKey`/`queryFn`). */
export interface UsePausedOptions extends Omit<
  UseQueryOptions<boolean>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * Whether a batcher is paused. While paused, joins and dispatches revert, so
 * disable the deposit or redeem form and say why; quit and claim still work.
 *
 * @param config - The batcher address.
 * @param options - React Query options (forwarded to `useQuery`).
 *
 * @example
 * ```tsx
 * const { data: paused } = usePaused({ address: "0xDepositBatcher" });
 * ```
 */
export function usePaused(config: UsePausedConfig, options?: UsePausedOptions) {
  const { enabled = true } = options ?? {};
  const batcher = useVaultBatcher(config.address, { chainId: config.chainId });
  const baseOptions = pausedQueryOptions(batcher);

  return useQuery<boolean>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
