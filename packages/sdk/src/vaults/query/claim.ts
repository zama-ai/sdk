import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { TransactionResult } from "../../types";
import type { VaultBatcher } from "../vault-batcher";

/** Variables for {@link claimMutationOptions}. */
export interface ClaimParams {
  /** The finalized batch to claim from. */
  batchId: bigint;
  /** The account to claim for. Defaults to the connected wallet account. */
  account?: Address;
}

/** Builds TanStack Query mutation options for {@link VaultBatcher.claim | claiming} a finalized batch. */
export function claimMutationOptions(
  batcher: VaultBatcher,
): MutationFactoryOptions<readonly ["zama.vault.claim", Address], ClaimParams, TransactionResult> {
  return {
    mutationKey: ["zama.vault.claim", batcher.address] as const,
    mutationFn: async ({ batchId, account }) => batcher.claim(batchId, account),
  };
}
