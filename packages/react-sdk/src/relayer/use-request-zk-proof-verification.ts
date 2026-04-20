"use client";

import type { EncryptResult } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { requestZKProofVerificationMutationOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Submit a ZK proof for on-chain verification.
 * Returns the input proof bytes for use in contract calls.
 *
 * @returns A mutation whose `mutate` accepts a {@link ZKProofLike}.
 *
 * @example
 * ```tsx
 * const verify = useRequestZKProofVerification();
 * verify.mutate(zkProof);
 * // verify.data => Uint8Array (input proof bytes)
 * ```
 */
export function useRequestZKProofVerification() {
  const sdk = useZamaSDK();
  return useMutation<EncryptResult, Error, unknown>(requestZKProofVerificationMutationOptions(sdk));
}
