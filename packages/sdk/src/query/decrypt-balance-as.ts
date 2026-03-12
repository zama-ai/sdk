import type { Address } from "viem";
import type { ReadonlyToken } from "../token/readonly-token";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link decryptBalanceAsMutationOptions}. */
export interface DecryptBalanceAsParams {
  delegatorAddress: Address;
  owner?: Address;
}

export function decryptBalanceAsMutationOptions(
  readonlyToken: ReadonlyToken,
): MutationFactoryOptions<
  readonly ["zama.decryptBalanceAs", Address],
  DecryptBalanceAsParams,
  bigint
> {
  return {
    mutationKey: ["zama.decryptBalanceAs", readonlyToken.address] as const,
    mutationFn: async ({ delegatorAddress, owner }) =>
      readonlyToken.decryptBalanceAs({ delegatorAddress, owner }),
  };
}
