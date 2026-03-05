"use client";

import type { DelegatedUserDecryptParams, DecryptedValue } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { useZamaSDK } from "../provider";

/**
 * Decrypt FHE ciphertext handles using delegated user credentials.
 * Returns a map of handle → plaintext bigint.
 *
 * @returns A mutation whose `mutate` accepts {@link DelegatedUserDecryptParams}.
 *
 * @example
 * ```tsx
 * const decrypt = useDelegatedUserDecrypt();
 * decrypt.mutate({ handles: ["0xHandle1"], ...credentials });
 * // decrypt.data => { "0xHandle1": 1000n }
 * ```
 */
export function useDelegatedUserDecrypt() {
  const sdk = useZamaSDK();
  return useMutation<Record<string, DecryptedValue>, Error, DelegatedUserDecryptParams>({
    mutationFn: (params) => sdk.relayer.delegatedUserDecrypt(params),
  });
}
