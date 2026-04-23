import type { Address } from "../utils/address";
import type { Hex } from "../utils/hex";
import type { Token } from "../token/token";
import type { TransactionResult, UnshieldCallbacks } from "../types";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link resumeUnshieldMutationOptions}. */
export interface ResumeUnshieldParams extends UnshieldCallbacks {
  unwrapTxHash: Hex;
}

export function resumeUnshieldMutationOptions(
  token: Token,
): MutationFactoryOptions<
  readonly ["zama.resumeUnshield", Address],
  ResumeUnshieldParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.resumeUnshield", token.address] as const,
    mutationFn: async ({ unwrapTxHash, ...callbacks }) =>
      token.resumeUnshield(unwrapTxHash, callbacks),
  };
}
