import type { ReadonlyToken } from "../token/readonly-token";
import type { DelegatedStoredCredentials } from "../token/token.types";
import type { Address } from "viem";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link decryptBalanceAsMutationOptions}. */
export interface DecryptBalanceAsParams {
  delegatorAddress: Address;
  owner?: Address;
  credentials?: {
    allow(
      delegatorAddress: Address,
      ...contractAddresses: Address[]
    ): Promise<DelegatedStoredCredentials>;
  };
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
    mutationFn: async ({ delegatorAddress, owner, credentials }) =>
      readonlyToken.decryptBalanceAs({ delegatorAddress, owner, credentials }),
  };
}
