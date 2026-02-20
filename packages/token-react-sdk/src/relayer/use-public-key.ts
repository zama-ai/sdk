"use client";

import { useMutation } from "@tanstack/react-query";
import { useConfidentialSDK } from "../provider";

type PublicKeyResult = {
  publicKeyId: string;
  publicKey: Uint8Array;
} | null;

export function usePublicKey() {
  const sdk = useConfidentialSDK();
  return useMutation<PublicKeyResult, Error, void>({
    mutationFn: () => sdk.relayer.getPublicKey(),
  });
}
