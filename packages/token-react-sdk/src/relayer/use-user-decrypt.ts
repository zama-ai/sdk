"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserDecryptParams } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";
import { useTokenSDK } from "../provider";

/**
 * Thin wrapper around sdk.userDecrypt().
 * Caller is responsible for providing all params (keypair, signature, etc.).
 * For the full orchestration (signature management, EIP712 signing),
 * see the app-level useUserDecryptFlow hook.
 *
 * On success, populates the decryption cache so useUserDecryptedValue/useUserDecryptedValues
 * can read the results.
 */
export function useUserDecrypt() {
  const sdk = useTokenSDK();
  const queryClient = useQueryClient();

  return useMutation<Record<string, bigint>, Error, UserDecryptParams>({
    mutationFn: (params) => sdk.relayer.userDecrypt(params),
    onSuccess: (data) => {
      for (const [handle, value] of Object.entries(data)) {
        queryClient.setQueryData(decryptionKeys.value(handle), value);
      }
    },
  });
}
