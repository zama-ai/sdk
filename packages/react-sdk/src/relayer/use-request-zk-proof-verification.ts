"use client";

import type { InputProofBytesType, ZKProofLike } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { useFhevmClient } from "../provider";

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
  const sdk = useFhevmClient();
  return useMutation<InputProofBytesType, Error, ZKProofLike>({
    mutationFn: (zkProof) => sdk.relayer.requestZKProofVerification(zkProof),
  });
}
