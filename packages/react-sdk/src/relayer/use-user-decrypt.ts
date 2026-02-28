"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";
import { useZamaSDK } from "../provider";

/** Handle + contract pair for decryption. */
export interface DecryptHandle {
  handle: string;
  contractAddress: Address;
}

/** Parameters for the orchestrated useUserDecrypt hook. */
export interface UseUserDecryptParams {
  /** Handles to decrypt, each with its contract address. */
  handles: DecryptHandle[];
}

/**
 * Orchestrated user decryption hook.
 * Manages credentials automatically: tries cached credentials first,
 * generates new ones (with wallet signature) only if missing or expired.
 *
 * On success, populates the decryption cache so useUserDecryptedValue/useUserDecryptedValues
 * can read the results.
 *
 * @example
 * ```tsx
 * const decrypt = useUserDecrypt();
 * decrypt.mutate({
 *   handles: [{ handle: "0xHandle", contractAddress: "0xContract" }],
 * });
 * ```
 */
export function useUserDecrypt() {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  return useMutation<Record<string, bigint>, Error, UseUserDecryptParams>({
    mutationFn: async ({ handles }) => {
      const signer = sdk.requireSigner();
      const signerAddress = await signer.getAddress();

      // Group handles by contract address for credential batching
      const contractAddresses = [...new Set(handles.map((h) => h.contractAddress))];
      const allHandles = handles.map((h) => h.handle);

      // Get or create credentials via CredentialsManager (auto-caches, auto-signs)
      const credentialsManager = sdk.credentialsManager;
      const creds = await credentialsManager.getAll(contractAddresses);

      // Decrypt all handles in a single relayer call
      return sdk.relayer.userDecrypt({
        handles: allHandles,
        contractAddress: contractAddresses[0]!,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
    },
    onSuccess: (data) => {
      for (const [handle, value] of Object.entries(data)) {
        queryClient.setQueryData(decryptionKeys.value(handle), value);
      }
    },
  });
}
