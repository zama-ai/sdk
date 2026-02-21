"use client";

import { useMutation } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

type PublicParamsResult = {
  publicParams: Uint8Array;
  publicParamsId: string;
} | null;

export function usePublicParams() {
  const sdk = useTokenSDK();
  return useMutation<PublicParamsResult, Error, number>({
    mutationFn: (bits) => sdk.relayer.getPublicParams(bits),
  });
}
