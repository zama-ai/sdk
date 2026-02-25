"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { readWrapperForTokenContract } from "@zama-fhe/sdk/viem";

type Params = Parameters<typeof readWrapperForTokenContract>;

export interface UseWrapperForZamaConfig {
  client: Params[0];
  coordinator: Address | undefined;
  tokenAddress: Address | undefined;
}

export interface UseWrapperForTokenSuspenseConfig {
  client: Params[0];
  coordinator: Address;
  tokenAddress: Address;
}

export function useWrapperForToken(config: UseWrapperForZamaConfig) {
  const { client, coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperForToken", client, coordinator, tokenAddress],
    queryFn: () =>
      readWrapperForTokenContract(client, coordinator as Address, tokenAddress as Address),
    enabled,
  });
}

export function useWrapperForTokenSuspense(config: UseWrapperForTokenSuspenseConfig) {
  const { client, coordinator, tokenAddress } = config;
  return useSuspenseQuery({
    queryKey: ["wrapperForToken", client, coordinator, tokenAddress],
    queryFn: () => readWrapperForTokenContract(client, coordinator, tokenAddress),
  });
}
