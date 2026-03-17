"use client";

import type { EncryptParams, EncryptResult } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { encryptMutationOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Encrypt a plaintext value using FHE.
 * Calls the relayer's `encrypt` method via a mutation.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link EncryptionFailedError} — FHE encryption failed
 *
 * @returns A mutation whose `mutate` accepts {@link EncryptParams}.
 *
 * @example
 * ```tsx
 * const encrypt = useEncrypt();
 * encrypt.mutate({ values: [{ value: 1000n, type: "euint64" }], contractAddress: "0x...", userAddress: "0x..." });
 * ```
 */
export function useEncrypt() {
  const sdk = useZamaSDK();
  return useMutation<EncryptResult, Error, EncryptParams>(encryptMutationOptions(sdk));
}
