"use client";

import { useMutation } from "@tanstack/react-query";
import type { Handle, PublicDecryptResult } from "@zama-fhe/sdk";
import { publicDecryptMutationOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Decrypt FHE ciphertext handles using the network public key (no credential needed).
 * On success, populates the decryption cache so subsequent queries
 * can read the results.
 *
 * @returns A mutation whose `mutate` accepts an array of handle strings.
 *
 * @example
 * ```tsx
 * const publicDecrypt = usePublicDecrypt();
 * publicDecrypt.mutate(["0xHandle1", "0xHandle2"]);
 * // publicDecrypt.data?.clearValues => { "0xHandle1": 500n, ... }
 * ```
 */
export function usePublicDecrypt() {
  const sdk = useZamaSDK();
  return useMutation<PublicDecryptResult, Error, Handle[]>(publicDecryptMutationOptions(sdk));
}
