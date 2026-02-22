"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readWrapperForTokenContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readWrapperForTokenContract>;

export interface UseWrapperForTokenConfig {
  provider: Params[0];
  coordinator: Hex | undefined;
  tokenAddress: Hex | undefined;
}

export interface UseWrapperForTokenSuspenseConfig {
  provider: Params[0];
  coordinator: Hex;
  tokenAddress: Hex;
}

export function useWrapperForToken(config: UseWrapperForTokenConfig) {
  const { provider, coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperForToken", provider, coordinator, tokenAddress],
    queryFn: () => readWrapperForTokenContract(provider, coordinator as Hex, tokenAddress as Hex),
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
