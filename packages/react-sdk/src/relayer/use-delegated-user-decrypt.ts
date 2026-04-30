"use client";

import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import {
  delegatedUserDecryptMutationOptions,
  type DelegatedUserDecryptMutationParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Decrypt FHE ciphertext handles using delegated user credentials.
 * Returns a map of handle → plaintext bigint.
 *
 * @returns A mutation whose `mutate` accepts {@link DelegatedUserDecryptMutationParams}.
 *
 * @example
 * ```tsx
 * const decrypt = useDelegatedUserDecrypt();
 * decrypt.mutate({ handles: [{ handle: "0xHandle1", contractAddress: "0x..." }], delegatorAddress: "0x..." });
 * // decrypt.data => { "0xHandle1": 1000n }
 * ```
 */
export function useDelegatedUserDecrypt() {
  const sdk = useZamaSDK();
  return useMutation<Record<Handle, ClearValueType>, Error, DelegatedUserDecryptMutationParams>(
    delegatedUserDecryptMutationOptions(sdk),
  );
}
