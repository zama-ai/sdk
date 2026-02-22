"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { readWrapperExistsContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readWrapperExistsContract>;

export interface UseWrapperExistsConfig {
  provider: Params[0];
  coordinator: Address | undefined;
  tokenAddress: Address | undefined;
}

export interface UseWrapperExistsSuspenseConfig {
  provider: Params[0];
  coordinator: Address;
  tokenAddress: Address;
}

export function useWrapperExists(config: UseWrapperExistsConfig) {
  const { provider, coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperExists", provider, coordinator, tokenAddress],
    queryFn: () =>
      readWrapperExistsContract(provider, coordinator as Address, tokenAddress as Address),
    enabled,
  });
}

export function useWrapperExistsSuspense(config: UseWrapperExistsSuspenseConfig) {
  const { provider, coordinator, tokenAddress } = config;
  return useSuspenseQuery({
    queryKey: ["wrapperExists", provider, coordinator, tokenAddress],
    queryFn: () => readWrapperExistsContract(provider, coordinator, tokenAddress),
  });
}
