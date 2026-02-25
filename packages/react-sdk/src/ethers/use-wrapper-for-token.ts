"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Provider, Signer } from "ethers";
import { readWrapperForTokenContract } from "@zama-fhe/sdk/ethers";

export interface UseWrapperForZamaConfig {
  provider: Provider | Signer;
  coordinator: Address | undefined;
  tokenAddress: Address | undefined;
}

export interface UseWrapperForTokenSuspenseConfig {
  provider: Provider | Signer;
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
