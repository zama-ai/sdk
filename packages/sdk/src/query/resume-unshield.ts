import type { Token } from "../token/token";
import type { TransactionResult, UnshieldCallbacks } from "../token/token.types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address, Hex } from "viem";

/** Variables for {@link resumeUnshieldMutationOptions}. */
export interface ResumeUnshieldParams {
  unwrapTxHash: Hex;
  callbacks?: UnshieldCallbacks;
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
    mutationFn: async ({ unwrapTxHash, callbacks }) =>
      token.resumeUnshield(unwrapTxHash, callbacks),
  };
}
