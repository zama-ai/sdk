"use client";

import type { FHEKeypair } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useConfidentialSDK } from "../provider";

export function useGenerateKeypair() {
  const sdk = useConfidentialSDK();
  return useMutation<FHEKeypair, Error, void>({
    mutationFn: () => sdk.relayer.generateKeypair(),
  });
}
