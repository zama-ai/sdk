import type { Address } from "../utils/address";
import type { Token } from "../token/token";
import type { TransactionResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

export function unwrapAllMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["zama.unwrapAll", Address], void, TransactionResult> {
  return {
    mutationKey: ["zama.unwrapAll", token.address] as const,
    mutationFn: async () => token.unwrapAll(),
  };
}
