"use client";

import { useMutation } from "@tanstack/react-query";
import type { DecryptPublicValuesResult, EncryptedValue } from "@zama-fhe/sdk";
import { decryptPublicValuesMutationOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Decrypt FHE encrypted values using the network public key (no credential needed).
 * On success, results are available via `data.clearValues` and written to the
 * persistent decrypt cache.
 *
 * @returns A mutation whose `mutate` accepts an array of encrypted values.
 *
 * @example
 * ```tsx
 * const decryptPublicValues = useDecryptPublicValues();
 * decryptPublicValues.mutate(["0xEncryptedValue1", "0xEncryptedValue2"]);
 * // decryptPublicValues.data?.clearValues => { "0xEncryptedValue1": 500n, ... }
 * ```
 */
export function useDecryptPublicValues() {
  const sdk = useZamaSDK();
  return useMutation<DecryptPublicValuesResult, Error, EncryptedValue[]>(
    decryptPublicValuesMutationOptions(sdk),
  );
}
