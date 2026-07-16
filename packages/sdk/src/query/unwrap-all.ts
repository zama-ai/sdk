import type { WrappedToken } from "../token/wrapped-token";
import type { UnwrapResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

export function unwrapAllMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.unwrapAll", Address], void, UnwrapResult> {
  return {
    mutationKey: ["zama.unwrapAll", token.address] as const,
    mutationFn: async () => token.unwrapAll(),
  };
}
