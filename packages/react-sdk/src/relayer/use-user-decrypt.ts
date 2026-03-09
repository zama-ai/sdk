"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClearValueType, Handle, UserDecryptParams } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";
import { useZamaSDK } from "../provider";

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
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  return useMutation<Record<Handle, ClearValueType>, Error, UserDecryptParams>({
    mutationFn: (params) => sdk.relayer.userDecrypt(params),
    onSuccess: (data) => {
      for (const [handle, value] of Object.entries(data) as [Handle, ClearValueType][]) {
        queryClient.setQueryData(decryptionKeys.value(handle), value);
      }
    },
  });
}
