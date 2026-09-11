import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { TransactionResult } from "../../types";
import type { Vault } from "../vault";
import type { VaultJoinOptions } from "../types";

/** Variables for {@link requestWithdrawalMutationOptions}. */
export interface RequestWithdrawalParams extends VaultJoinOptions {
  /** Plaintext amount of shares to redeem. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link Vault.requestWithdrawal | requesting a withdrawal}. */
export function requestWithdrawalMutationOptions(
  vault: Vault,
): MutationFactoryOptions<
  readonly ["zama.vault.requestWithdrawal", Address],
  RequestWithdrawalParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.vault.requestWithdrawal", vault.redeemBatcher.address] as const,
    mutationFn: async ({ amount, ...rest }) => vault.requestWithdrawal(amount, rest),
  };
}
