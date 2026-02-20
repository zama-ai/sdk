"use client";

import type { EIP712TypedData } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useConfidentialSDK } from "../provider";

export interface CreateEIP712Params {
  publicKey: string;
  contractAddresses: `0x${string}`[];
  startTimestamp: number;
  durationDays?: number;
}

export function useCreateEIP712() {
  const sdk = useConfidentialSDK();
  return useMutation<EIP712TypedData, Error, CreateEIP712Params>({
    mutationFn: ({
      publicKey,
      contractAddresses,
      startTimestamp,
      durationDays,
    }) =>
      sdk.relayer.createEIP712(
        publicKey,
        contractAddresses,
        startTimestamp,
        durationDays,
      ),
  });
}
