"use client";

import type { FHEKeypair } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

export function useGenerateKeypair() {
  const sdk = useTokenSDK();
  return useMutation<FHEKeypair, Error, void>({
    mutationFn: () => sdk.relayer.generateKeypair(),
  });
}
