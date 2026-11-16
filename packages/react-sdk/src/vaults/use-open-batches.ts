"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import {
  openBatchesQueryOptions,
  type JoinDirection,
  type OpenBatch,
  type Vault,
  type VaultGroup,
} from "@zama-fhe/sdk/vaults";
import { useQuery } from "../utils/query";
import { useVaultClient } from "./use-vault-client";

/**
 * The open batch of each vault's active batcher, with when it can be dispatched.
 *
 * @returns `data` holds one open batch per vault, in group order.
 */
export function useOpenBatches(
  target: Vault | VaultGroup,
  direction: JoinDirection,
  options?: Omit<UseQueryOptions<readonly OpenBatch[]>, "queryKey" | "queryFn">,
) {
  const selection = "vaults" in target ? { group: target } : { vault: target };
  return useQuery<readonly OpenBatch[]>({
    ...openBatchesQueryOptions(useVaultClient(), { ...selection, direction }),
    ...options,
  });
}
