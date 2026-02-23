"use client";

import type { EncryptParams, EncryptResult, TokenSDK } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

/**
 * TanStack Query mutation options factory for FHE encrypt.
 *
 * @param sdk - A `TokenSDK` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function encryptMutationOptions(sdk: TokenSDK) {
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
  const sdk = useTokenSDK();
  return useMutation<EncryptResult, Error, EncryptParams>(encryptMutationOptions(sdk));
}
