"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import type {
  DecryptHandle,
  UserDecryptCallbacks,
  UserDecryptMutationParams,
} from "@zama-fhe/sdk/query";
import { userDecryptMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export type {
  UserDecryptCallbacks as DecryptCallbacks,
  DecryptHandle,
  UserDecryptMutationParams as DecryptParams,
};

/** Configuration for {@link useUserDecrypt}. */
export type UseUserDecryptConfig = UserDecryptCallbacks;

/**
 * High-level orchestration hook for user decryption.
 *
 * Reuses cached FHE credentials from `sdk.credentials` when available,
 * falling back to generating a fresh keypair + EIP-712 signature only when
 * no valid credentials exist. This avoids redundant wallet signature prompts.
 *
 * On success, populates the decryption cache so `useUserDecryptedValue` / `useUserDecryptedValues`
 * can read the results.
 *
 * @param config - Optional callbacks for step-by-step UX feedback.
 * @returns A mutation whose `mutate` accepts {@link UserDecryptMutationParams}.
 *
 * @example
 * ```tsx
 * const decrypt = useUserDecrypt({
 *   onCredentialsReady: () => setStep("decrypting"),
 *   onDecrypted: (values) => console.log(values),
 * });
 * decrypt.mutate({
 *   handles: [{ handle: "0xHandle", contractAddress: "0xContract" }],
 * });
 * ```
 */
export function useUserDecrypt(config?: UseUserDecryptConfig) {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  return useMutation<Record<Handle, ClearValueType>, Error, UserDecryptMutationParams>({
    ...userDecryptMutationOptions(sdk, config),
    onSuccess: (data) => {
      // Populate the shared decryption cache
      for (const [handle, value] of Object.entries(data) as [Handle, ClearValueType][]) {
        queryClient.setQueryData(zamaQueryKeys.decryption.handle(handle), value);
      }
    },
  });
}
