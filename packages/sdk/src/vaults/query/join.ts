import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { JoinOptions, JoinResult } from "../types";
import type { VaultBatcher } from "../vault-batcher";

/** Variables for {@link joinMutationOptions}. */
export interface JoinParams extends JoinOptions {
  /** Plaintext amount to contribute to the batch. */
  amount: bigint;
  /** Recipient of the batch's eventual output. Defaults to the connected wallet account. */
  beneficiary?: Address;
}

/**
 * Builds TanStack Query mutation options for {@link VaultBatcher.join | joining} a batch directly.
 * Low-level — most apps should use `depositMutationOptions` / `requestWithdrawalMutationOptions` instead.
 */
export function joinMutationOptions(
  batcher: VaultBatcher,
): MutationFactoryOptions<readonly ["zama.vault.join", Address], JoinParams, JoinResult> {
  return {
    mutationKey: ["zama.vault.join", batcher.address] as const,
    mutationFn: async ({ amount, beneficiary, ...options }) =>
      batcher.join(amount, beneficiary, options),
  };
}
