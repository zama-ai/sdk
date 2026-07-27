import type { Address } from "viem";
import type { Token } from "../token/token";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link decryptBalanceAsMutationOptions}. */
export interface DecryptBalanceAsParams {
  /** Address of the account that delegated decryption rights to the connected wallet. */
  delegatorAddress: Address;
  /** Account whose on-chain balance to read; defaults to the delegator address. */
  accountAddress?: Address;
}

/** Builds TanStack Query mutation options for {@link Token.decryptBalanceAs | decrypting} a balance via delegated decryption credentials. @see {@link DecryptBalanceAsParams} */
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
