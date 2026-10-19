import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { TransactionResult } from "../../types";
import type { VaultBatcher } from "../vault-batcher";

/** Variables for {@link quitMutationOptions}. */
export interface QuitParams {
  /** The pending or canceled batch to withdraw the caller's own deposit from. */
  batchId: bigint;
}

/** Builds TanStack Query mutation options for {@link VaultBatcher.quit | withdrawing a deposit} from a pending or canceled batch. */
export function quitMutationOptions(
  batcher: VaultBatcher,
): MutationFactoryOptions<readonly ["zama.vault.quit", Address], QuitParams, TransactionResult> {
  return {
    mutationKey: ["zama.vault.quit", batcher.address] as const,
    mutationFn: async ({ batchId }) => batcher.quit(batchId),
  };
}
