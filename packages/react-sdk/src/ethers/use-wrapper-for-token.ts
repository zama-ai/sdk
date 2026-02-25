"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { readWrapperForTokenContract } from "@zama-fhe/sdk/ethers";

type Params = Parameters<typeof readWrapperForTokenContract>;

export interface UseWrapperForZamaConfig {
  provider: Params[0];
  coordinator: Address | undefined;
  tokenAddress: Address | undefined;
}

export interface UseWrapperForTokenSuspenseConfig {
  provider: Params[0];
  coordinator: Address;
  tokenAddress: Address;
}

export function useWrapperForToken(config: UseWrapperForZamaConfig) {
  const { provider, coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperForToken", provider, coordinator, tokenAddress],
    queryFn: () =>
      readWrapperForTokenContract(provider, coordinator as Address, tokenAddress as Address),
    enabled,
  });
}

export function useWrapperForTokenSuspense(config: UseWrapperForTokenSuspenseConfig) {
  const { provider, coordinator, tokenAddress } = config;
  return useSuspenseQuery({
    queryKey: ["wrapperForToken", provider, coordinator, tokenAddress],
    queryFn: () => readWrapperForTokenContract(provider, coordinator, tokenAddress),
  });
}
