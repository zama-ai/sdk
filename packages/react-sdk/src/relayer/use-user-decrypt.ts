"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address, ClearValueType, Handle } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";
import { useZamaSDK } from "../provider";

/** A handle to decrypt, paired with its originating contract address. */
export interface DecryptHandle {
  handle: Handle;
  contractAddress: Address;
}

/** Parameters for {@link useUserDecrypt}. */
export interface DecryptParams {
  /** Encrypted handles to decrypt. */
  handles: DecryptHandle[];
}

/** Progress callbacks for the decrypt flow. */
export interface DecryptCallbacks {
  /** Fired after credentials are ready (either from cache or freshly generated). */
  onCredentialsReady?: () => void;
  /** Fired after decryption completes. */
  onDecrypted?: (values: Record<Handle, ClearValueType>) => void;
}

/** Configuration for {@link useUserDecrypt}. */
export type UseUserDecryptConfig = DecryptCallbacks;

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
 * @returns A mutation whose `mutate` accepts {@link DecryptParams}.
 *
 * @example
 * ```tsx
 * const decrypt = useUserDecrypt({
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

  return useMutation<Record<Handle, ClearValueType>, Error, DecryptParams>({
    mutationKey: ["userDecrypt"],
    mutationFn: async ({ handles }) => {
      // Resolve credentials — reuses cached keypair+signature if valid,
      // otherwise generates fresh ones (which may trigger a wallet prompt).
      const contractAddresses = [...new Set(handles.map((h) => h.contractAddress))];
      const creds = await sdk.credentials.allow(...contractAddresses);
      config?.onCredentialsReady?.();

      // Decrypt — group handles by contract address
      const signerAddress = await sdk.signer.getAddress();
      const allResults: Record<Handle, ClearValueType> = {};

      const handlesByContract = new Map<Address, Handle[]>();
      for (const h of handles) {
        const list = handlesByContract.get(h.contractAddress) ?? [];
        list.push(h.handle);
        handlesByContract.set(h.contractAddress, list);
      }

      for (const [contractAddress, contractHandles] of handlesByContract) {
        const result = await sdk.relayer.userDecrypt({
          handles: contractHandles,
          contractAddress,
          signedContractAddresses: creds.contractAddresses,
          privateKey: creds.privateKey,
          publicKey: creds.publicKey,
          signature: creds.signature,
          signerAddress,
          startTimestamp: creds.startTimestamp,
          durationDays: creds.durationDays,
        });
        Object.assign(allResults, result);
      }

      config?.onDecrypted?.(allResults);
      return allResults;
    },
    onSuccess: (data) => {
      // Populate the shared decryption cache
      for (const [handle, value] of Object.entries(data) as [Handle, ClearValueType][]) {
        queryClient.setQueryData(decryptionKeys.value(handle), value);
      }
    },
  });
}
