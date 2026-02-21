"use client";

import type { DelegatedUserDecryptParams } from "@zama-fhe/token-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

export function useDelegatedUserDecrypt() {
  const sdk = useTokenSDK();
  return useMutation<Record<string, bigint>, Error, DelegatedUserDecryptParams>({
    mutationFn: (params) => sdk.relayer.delegatedUserDecrypt(params),
  });
}
