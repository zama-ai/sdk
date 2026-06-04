"use client";

import type { ClearValue, EncryptedValue } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import {
  delegatedDecryptMutationOptions,
  type DelegatedDecryptMutationParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Decrypt FHE encrypted values using delegated user credentials.
 * Returns a map of encrypted value → plaintext bigint.
 *
 * @returns A mutation whose `mutate` accepts {@link DelegatedDecryptMutationParams}.
 *
 * @example
 * ```tsx
 * const decrypt = useDelegatedDecryptValues();
 * decrypt.mutate({ encryptedInputs: [{ encryptedValue: "0xEncryptedValue1", contractAddress: "0x..." }], delegatorAddress: "0x..." });
 * // decrypt.data => { "0xEncryptedValue1": 1000n }
 * ```
 */
export function useDelegatedDecryptValues() {
  const sdk = useZamaSDK();
  return useMutation<Record<EncryptedValue, ClearValue>, Error, DelegatedDecryptMutationParams>(
    delegatedDecryptMutationOptions(sdk),
  );
}
