"use client";

import type { EncryptParams, EncryptResult, ZamaSDK } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { useZamaSDK } from "../provider";

/**
 * TanStack Query mutation options factory for FHE encrypt.
 *
 * @param sdk - A `ZamaSDK` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function encryptMutationOptions(sdk: ZamaSDK) {
  return {
    mutationKey: ["encrypt"] as const,
    mutationFn: (params: EncryptParams) => sdk.relayer.encrypt(params),
  };
}

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
  const sdk = useZamaSDK();
  return useMutation<EncryptResult, Error, EncryptParams>(encryptMutationOptions(sdk));
}
