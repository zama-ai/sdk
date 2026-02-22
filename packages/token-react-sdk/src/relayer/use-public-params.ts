"use client";

import { useQuery } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

export const publicParamsQueryKeys = {
  all: ["publicParams"] as const,
  bits: (bits: number) => ["publicParams", bits] as const,
} as const;

export interface PublicParamsData {
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
