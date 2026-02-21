"use client";

import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

type PublicKeyResult = {
  publicKeyId: string;
  publicKey: Uint8Array;
} | null;

export function usePublicKey() {
  const sdk = useTokenSDK();
  return useMutation<PublicKeyResult, Error, void>({
    mutationFn: () => sdk.relayer.getPublicKey(),
  });
}
