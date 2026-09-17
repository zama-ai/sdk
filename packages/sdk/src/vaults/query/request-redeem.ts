import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { Vault } from "../vault";
import type { JoinResult, VaultJoinOptions } from "../types";

/** Variables for {@link requestRedeemMutationOptions}. */
export interface RequestRedeemParams extends VaultJoinOptions {
  /** Plaintext amount of shares to redeem. */
  amount: bigint;
}

/** Builds TanStack Query mutation options for {@link Vault.requestRedeem | requesting a redemption}. */
export function requestRedeemMutationOptions(
  vault: Vault,
): MutationFactoryOptions<
  readonly ["zama.vault.requestRedeem", Address],
  RequestRedeemParams,
  JoinResult
> {
  return {
    mutationKey: ["zama.vault.requestRedeem", vault.redeemBatcher.address] as const,
    mutationFn: async ({ amount, ...rest }) => vault.requestRedeem(amount, rest),
  };
}
