"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { PublicClient } from "viem";
import { readUnderlyingTokenContract } from "@zama-fhe/sdk/viem";

export interface UseUnderlyingZamaConfig {
  client: PublicClient;
  wrapperAddress: Address | undefined;
}

export interface UseUnderlyingTokenSuspenseConfig {
  client: PublicClient;
  wrapperAddress: Address;
}

export function useUnderlyingToken(config: UseUnderlyingZamaConfig) {
  const { client, wrapperAddress } = config;
  const enabled = !!wrapperAddress;
  return useQuery({
    queryKey: ["underlyingToken", client, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(client, wrapperAddress as Address),
    enabled,
  });
}

export function useUnderlyingTokenSuspense(config: UseUnderlyingTokenSuspenseConfig) {
  const { client, wrapperAddress } = config;
  return useSuspenseQuery({
    queryKey: ["underlyingToken", client, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(client, wrapperAddress),
  });
}
