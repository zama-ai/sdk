import type { WrappedToken } from "../token/wrapped-token";
import type { TransactionResult, UnshieldCallbacks } from "../types";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address, Hex } from "viem";

/** Variables for {@link resumeUnshieldMutationOptions}. */
export interface ResumeUnshieldParams extends UnshieldCallbacks {
  /** Hash of the earlier unwrap request transaction to resume from. */
  unwrapTxHash: Hex;
}

/** Builds TanStack Query mutation options for {@link WrappedToken.resumeUnshield | resuming} an interrupted unshield from its unwrap request transaction. @see {@link ResumeUnshieldParams} */
export function resumeUnshieldMutationOptions(
  token: WrappedToken,
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
