import type { WrappedToken } from "../token/wrapped-token";
import type { UnwrapResult } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

/** Builds TanStack Query mutation options for {@link WrappedToken.unwrapAll | unwrapping} the entire confidential balance. */
export function unwrapAllMutationOptions(
  token: WrappedToken,
): MutationFactoryOptions<readonly ["zama.unwrapAll", Address], void, UnwrapResult> {
  return {
    mutationKey: ["zama.unwrapAll", token.address] as const,
    mutationFn: async () => token.unwrapAll(),
  };
}
