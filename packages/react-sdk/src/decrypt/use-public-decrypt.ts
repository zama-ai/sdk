"use client";

import { useMutation } from "@tanstack/react-query";
import type { DecryptPublicValuesResult, EncryptedValue } from "@zama-fhe/sdk";
import { publicDecryptMutationOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Decrypt FHE ciphertext handles using the network public key (no credential needed).
 * On success, results are available via `data.clearValues` and written to the
 * persistent decrypt cache.
 *
 * @returns A mutation whose `mutate` accepts an array of handle strings.
 *
 * @example
 * ```tsx
 * const decryptPublicValues = useDecryptPublicValues();
 * decryptPublicValues.mutate(["0xHandle1", "0xHandle2"]);
 * // decryptPublicValues.data?.clearValues => { "0xHandle1": 500n, ... }
 * ```
 */
export function useDecryptPublicValues() {
  const sdk = useZamaSDK();
  return useMutation<DecryptPublicValuesResult, Error, EncryptedValue[]>(
    publicDecryptMutationOptions(sdk),
  );
}
