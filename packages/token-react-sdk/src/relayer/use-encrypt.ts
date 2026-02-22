"use client";

import type { EncryptParams, EncryptResult } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

/**
 * Encrypt a plaintext value using FHE.
 * Calls the relayer's `encrypt` method via a mutation.
 *
 * @returns A mutation whose `mutate` accepts {@link EncryptParams}.
 *
 * @example
 * ```tsx
 * const encrypt = useEncrypt();
 * encrypt.mutate({ values: [1000n], bits: [64] });
 * ```
 */
export function useEncrypt() {
  const sdk = useTokenSDK();
  return useMutation<EncryptResult, Error, EncryptParams>({
    mutationFn: (params) => sdk.relayer.encrypt(params),
  });
}
