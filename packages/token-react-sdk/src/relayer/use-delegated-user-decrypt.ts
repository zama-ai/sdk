"use client";

import type { DelegatedUserDecryptParams } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

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
  const sdk = useTokenSDK();
  return useMutation<Record<string, bigint>, Error, DelegatedUserDecryptParams>({
    mutationFn: (params) => sdk.relayer.delegatedUserDecrypt(params),
  });
}
