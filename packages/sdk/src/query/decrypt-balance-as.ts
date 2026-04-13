import type { Address } from "viem";
import type { Token } from "../token/token";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link decryptBalanceAsMutationOptions}. */
export interface DecryptBalanceAsParams {
  delegatorAddress: Address;
  owner?: Address;
}

export function decryptBalanceAsMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.decryptBalanceAs", Address],
  DecryptBalanceAsParams,
  bigint
> {
  return {
    mutationKey: ["zama.decryptBalanceAs", token.address] as const,
    mutationFn: async ({ delegatorAddress, owner }) =>
      token.decryptBalanceAs({ delegatorAddress, owner }),
  };
}
