import { SignerRequiredError } from "../errors/signer";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

export function unwrapAllMutationOptions(
  token: Token | undefined,
  tokenAddress: Address,
): MutationFactoryOptions<readonly ["zama.unwrapAll", Address], void, TransactionResult> {
  return {
    mutationKey: ["zama.unwrapAll", tokenAddress] as const,
    mutationFn: async () => {
      if (!token) throw new SignerRequiredError("unwrapAll");
      return token.unwrapAll();
    },
  };
}
