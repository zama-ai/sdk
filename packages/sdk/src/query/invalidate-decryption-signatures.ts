import type { TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link invalidateDecryptionSignaturesMutationOptions}. */
export interface InvalidateDecryptionSignaturesParams {
  /** Oldest timestamp that remains valid. Omit to invalidate everything up to now. */
  timestamp?: Date;
}

/** Builds TanStack Query mutation options for {@link Permits.invalidateDecryptionSignatures | invalidating} every decryption signature signed before a timestamp. @see {@link InvalidateDecryptionSignaturesParams} */
export function invalidateDecryptionSignaturesMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<
  readonly ["zama.invalidateDecryptionSignatures"],
  InvalidateDecryptionSignaturesParams,
  TransactionResult
> {
  return {
    mutationKey: ["zama.invalidateDecryptionSignatures"] as const,
    mutationFn: async ({ timestamp }) => sdk.permits.invalidateDecryptionSignatures(timestamp),
  };
}
