"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PublicDecryptResult } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";
import { useZamaSDK } from "../provider";

/**
 * Decrypt FHE ciphertext handles using the network public key (no credential needed).
 * On success, populates the decryption cache so {@link useUserDecryptedValue} / {@link useUserDecryptedValues}
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
  const queryClient = useQueryClient();
  return useMutation<PublicDecryptResult, Error, string[]>({
    mutationFn: (handles) => sdk.relayer.publicDecrypt(handles),
    onSuccess: (data) => {
      for (const [handle, value] of Object.entries(data.clearValues)) {
        queryClient.setQueryData(decryptionKeys.value(handle), value);
      }
    },
  });
}
