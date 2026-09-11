import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { TransactionResult } from "../../types";
import type { Vault } from "../vault";
import type { VaultJoinOptions } from "../types";

/** Variables for {@link depositMutationOptions}. */
export interface DepositParams extends VaultJoinOptions {
  /** Plaintext amount to deposit. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link Vault.deposit | depositing} into a vault. */
export function depositMutationOptions(
  vault: Vault,
): MutationFactoryOptions<
  readonly ["zama.vault.deposit", Address],
  DepositParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.vault.deposit", vault.depositBatcher.address] as const,
    mutationFn: async ({ amount, ...rest }) => vault.deposit(amount, rest),
  };
}
