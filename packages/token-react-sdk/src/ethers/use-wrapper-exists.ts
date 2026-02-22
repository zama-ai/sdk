"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readWrapperExistsContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readWrapperExistsContract>;

export interface UseWrapperExistsConfig {
  provider: Params[0];
  coordinator: Hex | undefined;
  tokenAddress: Hex | undefined;
}

export interface UseWrapperExistsSuspenseConfig {
  provider: Params[0];
  coordinator: Hex;
  tokenAddress: Hex;
}

export function useWrapperExists(config: UseWrapperExistsConfig) {
  const { provider, coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperExists", provider, coordinator, tokenAddress],
    queryFn: () => readWrapperExistsContract(provider, coordinator as Hex, tokenAddress as Hex),
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
