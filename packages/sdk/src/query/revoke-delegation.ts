import type { Token } from "../token/token";
import type { Address } from "viem";
import type { TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link revokeDelegationMutationOptions}. */
export interface RevokeDelegationParams {
  delegateAddress: Address;
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
    mutationFn: async ({ delegateAddress }) => token.revokeDelegation({ delegateAddress }),
  };
}
