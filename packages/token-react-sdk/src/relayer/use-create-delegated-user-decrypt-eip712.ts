"use client";

import type { Address, KmsDelegatedUserDecryptEIP712Type } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

export interface CreateDelegatedUserDecryptEIP712Params {
  publicKey: string;
  contractAddresses: Address[];
  delegatorAddress: string;
  startTimestamp: number;
  durationDays?: number;
}

export function useCreateDelegatedUserDecryptEIP712() {
  const sdk = useTokenSDK();
  return useMutation<
    KmsDelegatedUserDecryptEIP712Type,
    Error,
    CreateDelegatedUserDecryptEIP712Params
  >({
    mutationFn: ({
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    }) =>
      sdk.relayer.createDelegatedUserDecryptEIP712(
        publicKey,
        contractAddresses,
        delegatorAddress,
        startTimestamp,
        durationDays,
      ),
  });
}
