import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { VaultGroup, VaultGroupJoinOptions, VaultGroupJoinResult } from "../vault-group";

/** Variables for {@link groupRedeemMutationOptions}. */
export interface GroupRedeemParams extends VaultGroupJoinOptions {
  /** The member of the group to redeem from. */
  vaultId: string;
  /** Plaintext amount of shares to redeem. */
  amount: bigint;
}

/** Builds mutation options for {@link VaultGroup.redeem | redeeming shares} from a group. */
export function groupRedeemMutationOptions(
  group: VaultGroup,
): MutationFactoryOptions<
  readonly ["zama.vaultGroup.redeem", { cAsset: Address; vaults: readonly Address[] }],
  GroupRedeemParams,
  VaultGroupJoinResult
> {
  return {
    // Keyed on the vaults, not the group's id, which two groups may share.
    mutationKey: [
      "zama.vaultGroup.redeem",
      { cAsset: group.cAsset, vaults: group.vaults.map((member) => member.vault) },
    ] as const,
    mutationFn: async ({ vaultId, amount, ...rest }) => group.redeem(vaultId, amount, rest),
  };
}
