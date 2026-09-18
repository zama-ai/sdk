import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { TransactionResult } from "../../types";
import type { VaultBatcher } from "../vault-batcher";

/** Variables for {@link recoverMutationOptions}. */
export interface RecoverParams {
  /** The canceled batch holding the deposit. */
  batchId: bigint;
  /** The depositor to refund. Defaults to the connected wallet account. */
  account?: Address;
}

/** Builds TanStack Query mutation options for {@link VaultBatcher.recover | refunding a deposit} in a canceled batch on the depositor's behalf. */
export function recoverMutationOptions(
  batcher: VaultBatcher,
): MutationFactoryOptions<
  readonly ["zama.vault.recover", Address],
  RecoverParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.vault.recover", batcher.address] as const,
    mutationFn: async ({ batchId, account }) => batcher.recover(batchId, account),
  };
}
