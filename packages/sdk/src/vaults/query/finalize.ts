import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { TransactionResult } from "../../types";
import type { VaultBatcher } from "../vault-batcher";

/** Variables for {@link finalizeMutationOptions}. */
export interface FinalizeParams {
  /** The dispatched batch to settle. */
  batchId: bigint;
}

/** Builds TanStack Query mutation options for {@link VaultBatcher.finalize | finalizing} a dispatched batch. Permissionless. */
export function finalizeMutationOptions(
  batcher: VaultBatcher,
): MutationFactoryOptions<
  readonly ["zama.vault.finalize", Address],
  FinalizeParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.vault.finalize", batcher.address] as const,
    mutationFn: async ({ batchId }: FinalizeParams) => batcher.finalize(batchId),
  };
}
