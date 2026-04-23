import type { Address } from "../utils/address";
import type { ReadonlyToken } from "../token/readonly-token";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link decryptBalanceAsMutationOptions}. */
export interface DecryptBalanceAsParams {
  delegatorAddress: Address;
  accountAddress?: Address;
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
    mutationFn: async ({ delegatorAddress, accountAddress }) =>
      readonlyToken.decryptBalanceAs({ delegatorAddress, accountAddress }),
  };
}
