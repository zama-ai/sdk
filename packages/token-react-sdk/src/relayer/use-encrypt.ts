"use client";

import type { EncryptParams, EncryptResult } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

export function useEncrypt() {
  const sdk = useTokenSDK();
  return useMutation<EncryptResult, Error, EncryptParams>({
    mutationFn: (params) => sdk.relayer.encrypt(params),
  });
}
