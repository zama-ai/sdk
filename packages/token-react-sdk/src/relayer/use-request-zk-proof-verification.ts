"use client";

import type { InputProofBytesType, ZKProofLike } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

export function useRequestZKProofVerification() {
  const sdk = useTokenSDK();
  return useMutation<InputProofBytesType, Error, ZKProofLike>({
    mutationFn: (zkProof) => sdk.relayer.requestZKProofVerification(zkProof),
  });
}
