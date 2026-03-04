import type { Token } from "../token/token";
import type { Address, TransactionResult } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";

export function unwrapAllMutationOptions(
  token: Token,
): MutationFactoryOptions<readonly ["unwrapAll", Address], void, TransactionResult> {
  return {
    mutationKey: ["unwrapAll", token.address] as const,
    mutationFn: async () => token.unwrapAll(),
  };
}
