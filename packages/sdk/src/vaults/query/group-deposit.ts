import type { MutationFactoryOptions } from "../../query/factory-types";
import type { VaultGroup, VaultGroupJoinOptions, VaultGroupJoinResult } from "../vault-group";

/** Variables for {@link groupDepositMutationOptions}. */
export interface GroupDepositParams extends VaultGroupJoinOptions {
  /** The member of the group to deposit into. */
  vaultId: string;
  /** Plaintext amount to deposit. */
  amount: bigint;
}

/** Variables for {@link groupRequestWithdrawalMutationOptions}. */
export interface GroupRequestWithdrawalParams extends VaultGroupJoinOptions {
  /** The member of the group to withdraw from. */
  vaultId: string;
  /** Plaintext amount of shares to redeem. */
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

/** Builds mutation options for {@link VaultGroup.requestWithdrawal | requesting a withdrawal} from a group. */
export function groupRequestWithdrawalMutationOptions(
  group: VaultGroup,
): MutationFactoryOptions<
  readonly ["zama.vaultGroup.requestWithdrawal", string],
  GroupRequestWithdrawalParams,
  VaultGroupJoinResult
> {
  return {
    mutationKey: ["zama.vaultGroup.requestWithdrawal", group.id] as const,
    mutationFn: async ({ vaultId, amount, ...rest }) =>
      group.requestWithdrawal(vaultId, amount, rest),
  };
}
