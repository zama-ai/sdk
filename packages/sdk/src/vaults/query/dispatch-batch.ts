import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { TransactionResult } from "../../types";
import type { VaultBatcher } from "../vault-batcher";

/** Builds TanStack Query mutation options for {@link VaultBatcher.dispatchBatch | dispatching} the current batch. Permissionless — takes no variables. */
export function dispatchBatchMutationOptions(
  batcher: VaultBatcher,
): MutationFactoryOptions<readonly ["zama.vault.dispatchBatch", Address], void, TransactionResult> {
  return {
    mutationKey: ["zama.vault.dispatchBatch", batcher.address] as const,
    mutationFn: async () => batcher.dispatchBatch(),
  };
}
