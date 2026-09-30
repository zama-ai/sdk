import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { VaultGroup, VaultGroupJoinOptions, VaultGroupJoinResult } from "../vault-group";

/** Variables for {@link groupDepositMutationOptions}. */
export interface GroupDepositParams extends VaultGroupJoinOptions {
  /** The member of the group to deposit into. */
  vaultId: string;
  /** Plaintext amount to deposit. */
  amount: bigint;
}

/** Builds mutation options for {@link VaultGroup.deposit | depositing} into a group. */
export function groupDepositMutationOptions(
  group: VaultGroup,
): MutationFactoryOptions<
  readonly ["zama.vaultGroup.deposit", { cAsset: Address; vaults: readonly Address[] }],
  GroupDepositParams,
  VaultGroupJoinResult
> {
  return {
    // Keyed on the vaults, not the group's id, which two groups may share.
    mutationKey: [
      "zama.vaultGroup.deposit",
      { cAsset: group.cAsset, vaults: group.vaults.map((member) => member.vault) },
    ] as const,
    mutationFn: async ({ vaultId, amount, ...rest }) => group.deposit(vaultId, amount, rest),
  };
}
