import type { Address } from "viem";
import type { MutationFactoryOptions } from "../../query/factory-types";
import type { JoinOptions } from "../types";
import type { VaultGroup, VaultGroupJoinResult } from "../vault-group";

/** Variables for {@link groupDepositMutationOptions}. */
export interface GroupDepositParams extends JoinOptions {
  /** The member of the group to deposit into. */
  vaultId: string;
  /** Plaintext amount to deposit. */
  amount: bigint;
}

/** Builds mutation options for {@link VaultGroup.deposit | depositing} into a group. */
export function groupDepositMutationOptions(
  group: VaultGroup,
): MutationFactoryOptions<
  readonly ["zama.vaultGroup.deposit", { cAsset: Address; batchers: readonly Address[] }],
  GroupDepositParams,
  VaultGroupJoinResult
> {
  return {
    // Keyed on the batchers, not the group's id, which two groups may share.
    mutationKey: [
      "zama.vaultGroup.deposit",
      {
        cAsset: group.cAsset,
        batchers: group.members.map(({ vault }) => vault.depositBatcher.address),
      },
    ] as const,
    mutationFn: async ({ vaultId, amount, ...rest }) => group.deposit(vaultId, amount, rest),
  };
}
