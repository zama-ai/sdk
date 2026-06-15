"use client";

import type { ClearValue, EncryptedValue } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import {
  delegatedDecryptMutationOptions,
  type DelegatedDecryptMutationParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Decrypt FHE ciphertext handles using delegated user credentials.
 * Returns a map of handle → plaintext bigint.
 *
 * @returns A mutation whose `mutate` accepts {@link DelegatedDecryptMutationParams}.
 *
 * @example
 * ```tsx
 * const decrypt = useDelegatedDecrypt();
 * decrypt.mutate({ encryptedInputs: [{ encryptedValue: "0xHandle1", contractAddress: "0x..." }], delegatorAddress: "0x..." });
 * // decrypt.data => { "0xHandle1": 1000n }
 * ```
 */
export function useDelegatedDecrypt() {
  const sdk = useZamaSDK();
  return useMutation<Record<EncryptedValue, ClearValue>, Error, DelegatedDecryptMutationParams>(
    delegatedDecryptMutationOptions(sdk),
  );
}
