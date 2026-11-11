"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import {
  openBatchesQueryOptions,
  type Direction,
  type OpenBatch,
  type VaultGroup,
} from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultClient } from "./use-vault-client";

/**
 * The open batch of each vault's active batcher, with when it can be
 * dispatched.
 *
 * @returns The query result; `data` holds one open batch per vault, in group order.
 *
 * @example
 * ```tsx
 * const { data: batches } = useOpenBatches(STABLE, "deposit");
 * ```
 */
export function useOpenBatches(
  group: VaultGroup,
  direction: Direction,
  options?: Omit<UseQueryOptions<readonly OpenBatch[]>, "queryKey" | "queryFn">,
) {
  return useQuery<readonly OpenBatch[]>({
    ...openBatchesQueryOptions(useVaultClient(), { group, direction }),
    ...options,
  });
}
