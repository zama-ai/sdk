"use client";

import { useQuery } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

interface PublicParamsData {
  publicParams: Uint8Array;
  publicParamsId: string;
}

type PublicParamsResult = PublicParamsData | null;

export function usePublicParams(bits: number) {
  const sdk = useTokenSDK();
  return useQuery<PublicParamsResult, Error>({
    queryKey: ["publicParams", bits],
    queryFn: () => sdk.relayer.getPublicParams(bits),
    staleTime: Infinity,
  });
}
