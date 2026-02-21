"use client";

import { useMutation } from "@tanstack/react-query";
import type { PublicDecryptResult } from "@zama-fhe/token-sdk";
import { decryptionKeys } from "./decryption-cache";
import { useTokenSDK } from "../provider";

/**
 * On success, populates the decryption cache so useUserDecryptedValue/useUserDecryptedValues
 * can read the results.
 */
export function usePublicDecrypt() {
  const sdk = useTokenSDK();
  return useMutation<PublicDecryptResult, Error, string[]>({
    mutationFn: (handles) => sdk.relayer.publicDecrypt(handles),
    onSuccess: (data, _variable, _result, { client }) => {
      for (const [handle, value] of Object.entries(data.clearValues)) {
        client.setQueryData(decryptionKeys.value(handle), value);
      }
    },
  });
}
