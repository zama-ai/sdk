"use client";

import { useQuery } from "@tanstack/react-query";
import { useTokenSDK } from "../provider";

interface PublicKeyData {
  publicKeyId: string;
  publicKey: Uint8Array;
}

type PublicKeyResult = PublicKeyData | null;

export function usePublicKey() {
  const sdk = useTokenSDK();
  return useQuery<PublicKeyResult, Error>({
    queryKey: ["publicKey"],
    queryFn: () => sdk.relayer.getPublicKey(),
    staleTime: Infinity,
  });
}
