"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import {
  invalidateDecryptionSignaturesMutationOptions,
  zamaQueryKeys,
  type InvalidateDecryptionSignaturesParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Invalidate every decryption signature the connected signer has signed
 * before a given timestamp, via the on-chain ACL. Call this on suspected
 * signing-key compromise or on a multisig (ERC-1271/Safe) owner rotation.
 *
 * @example
 * ```tsx
 * const invalidate = useInvalidateDecryptionSignatures();
 * invalidate.mutate({});
 * ```
 */
export function useInvalidateDecryptionSignatures(
  options?: UseMutationOptions<TransactionResult, Error, InvalidateDecryptionSignaturesParams>,
) {
  const sdk = useZamaSDK();

  return useMutation<TransactionResult, Error, InvalidateDecryptionSignaturesParams>({
    ...invalidateDecryptionSignaturesMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
      context.client.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
    },
  });
}
