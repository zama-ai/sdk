"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import {
  openBatchesQueryOptions,
  type Direction,
  type GroupId,
  type OpenBatch,
  type VaultId,
  type VaultsConfig,
} from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultClient } from "./use-vault-client";

/**
 * The open batch of every vault of a group, for a form that shows when the
 * next batch closes. Needs no join record.
 *
 * @example
 * ```tsx
 * const { data: batches } = useOpenBatches(VAULTS, { groupId: "stable", direction: "deposit" });
 * ```
 */
export function useOpenBatches<
  const TConfig extends VaultsConfig,
  TGroupId extends GroupId<TConfig>,
>(
  config: TConfig,
  params: { readonly groupId: TGroupId; readonly direction: Direction },
  options?: Omit<
    UseQueryOptions<readonly OpenBatch<VaultId<TConfig, TGroupId>>[]>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery<readonly OpenBatch<VaultId<TConfig, TGroupId>>[]>({
    ...openBatchesQueryOptions(useVaultClient(config), params),
    ...options,
  });
}
