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
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link DecryptionFailedError} — relayer decryption request failed
 * - {@link InvalidKeypairError} — the provided keypair is invalid
 * - {@link KeypairExpiredError} — the re-encryption keypair has expired
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
