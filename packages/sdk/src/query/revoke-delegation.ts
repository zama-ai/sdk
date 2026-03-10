import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link revokeDelegationMutationOptions}. */
export interface RevokeDelegationParams {
  delegate: Address;
}

export function revokeDelegationMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.revokeDelegation", Address],
  RevokeDelegationParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.revokeDelegation", token.address] as const,
    mutationFn: async ({ delegate }) => token.revokeDelegation(delegate),
  };
}
