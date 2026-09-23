import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { Vault } from "../vault";
import type { JoinResult, VaultJoinOptions } from "../types";

/** Variables for {@link redeemMutationOptions}. */
export interface RedeemParams extends VaultJoinOptions {
  /** Plaintext amount of shares to redeem. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link Vault.redeem | redeeming shares}. */
export function redeemMutationOptions(
  vault: Vault,
): MutationFactoryOptions<readonly ["zama.vault.redeem", Address], RedeemParams, JoinResult> {
  return {
    mutationKey: ["zama.vault.redeem", vault.redeemBatcher.address] as const,
    mutationFn: async ({ amount, ...rest }) => vault.redeem(amount, rest),
  };
}
