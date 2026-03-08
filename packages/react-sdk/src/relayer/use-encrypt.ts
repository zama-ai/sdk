"use client";

import type { EncryptParams, EncryptResult } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { encryptMutationOptions } from "@zama-fhe/sdk/query";
import { useFhevmClient } from "../provider";

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
  const sdk = useFhevmClient();
  return useMutation<EncryptResult, Error, EncryptParams>(encryptMutationOptions(sdk));
}
