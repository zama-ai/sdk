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
  readonly ["zama.vaultGroup.deposit", string],
  GroupDepositParams,
  VaultGroupJoinResult
> {
  return {
    mutationKey: ["zama.vaultGroup.deposit", group.id] as const,
    mutationFn: async ({ vaultId, amount, ...rest }) => group.deposit(vaultId, amount, rest),
  };
}
