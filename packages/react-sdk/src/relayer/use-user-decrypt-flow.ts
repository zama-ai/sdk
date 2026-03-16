"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address, ClearValueType, Handle, Hex } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";
import { useZamaSDK } from "../provider";

/** A handle to decrypt, paired with its originating contract address. */
export interface DecryptHandle {
  handle: Handle;
  contractAddress: Address;
}

/** Parameters for {@link useUserDecryptFlow}. */
export interface UserDecryptFlowParams {
  /** Encrypted handles to decrypt. */
  handles: DecryptHandle[];
  /** Number of days the credential remains valid. Defaults to `Math.ceil(keypairTTL / 86400)`. */
  durationDays?: number;
}

/** Progress callbacks for each step of the decrypt flow. */
export interface UserDecryptFlowCallbacks {
  /** Fired after the keypair is generated. */
  onKeypairGenerated?: () => void;
  /** Fired after the EIP-712 typed data is created, before wallet signing. */
  onEIP712Created?: () => void;
  /** Fired after the wallet signature is obtained. */
  onSigned?: (signature: Hex) => void;
  /** Fired after decryption completes. */
  onDecrypted?: (values: Record<Handle, ClearValueType>) => void;
}

/** Configuration for {@link useUserDecryptFlow}. */
export interface UseUserDecryptFlowConfig {
  /** Optional progress callbacks. */
  callbacks?: UserDecryptFlowCallbacks;
}

/**
 * High-level orchestration hook for user decryption.
 * Handles the full flow: keypair generation → EIP-712 creation → wallet signature → decryption.
 *
 * On success, populates the decryption cache so `useUserDecryptedValue` / `useUserDecryptedValues`
 * can read the results.
 *
 * @param config - Optional callbacks for step-by-step UX feedback.
 * @returns A mutation whose `mutate` accepts {@link UserDecryptFlowParams}.
 *
 * @example
 * ```tsx
 * const decryptFlow = useUserDecryptFlow({
 *   callbacks: { onSigned: () => setStep("decrypting") },
 * });
 * decryptFlow.mutate({
 *   handles: [{ handle: "0xHandle", contractAddress: "0xContract" }],
 * });
 * ```
 */
export function useUserDecryptFlow(config?: UseUserDecryptFlowConfig) {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();
  const callbacks = config?.callbacks;

  return useMutation<Record<Handle, ClearValueType>, Error, UserDecryptFlowParams>({
    mutationKey: ["userDecryptFlow"],
    mutationFn: async ({
      handles,
      durationDays = Math.max(1, Math.ceil(sdk.credentials.keypairTTL / 86400)),
    }) => {
      // Step 1: Generate keypair
      const keypair = await sdk.relayer.generateKeypair();
      callbacks?.onKeypairGenerated?.();

      // Step 2: Create EIP-712 typed data
      const contractAddresses = [...new Set(handles.map((h) => h.contractAddress))];
      const startTimestamp = Math.floor(Date.now() / 1000);
      const eip712 = await sdk.relayer.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimestamp,
        durationDays,
      );
      callbacks?.onEIP712Created?.();

      // Step 3: Sign with wallet
      const signature = await sdk.signer.signTypedData(eip712);
      callbacks?.onSigned?.(signature);

      // Step 4: Decrypt — group handles by contract address
      const signerAddress = await sdk.signer.getAddress();
      const allResults: Partial<Record<Handle, ClearValueType>> = {};

      // Decrypt per contract address (the relayer requires handles from the same contract)
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
          signedContractAddresses: contractAddresses,
          privateKey: keypair.privateKey,
          publicKey: keypair.publicKey,
          signature,
          signerAddress,
          startTimestamp,
          durationDays,
        });
        Object.assign(allResults, result);
      }

      const results = allResults as Record<Handle, ClearValueType>;
      callbacks?.onDecrypted?.(results);
      return results;
    },
    onSuccess: (data) => {
      // Populate the shared decryption cache
      for (const [handle, value] of Object.entries(data) as [Handle, ClearValueType][]) {
        queryClient.setQueryData(decryptionKeys.value(handle), value);
      }
    },
  });
}
