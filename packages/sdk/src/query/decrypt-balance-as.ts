import type { Address } from "viem";
import type { Token } from "../token/token";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link decryptBalanceAsMutationOptions}. */
export interface DecryptBalanceAsParams {
  delegatorAddress: Address;
  accountAddress?: Address;
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
    mutationFn: async ({ delegatorAddress, accountAddress }) =>
      token.decryptBalanceAs({ delegatorAddress, accountAddress }),
  };
}
