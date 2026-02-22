"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readWrapperForTokenContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readWrapperForTokenContract>;

export interface UseWrapperForTokenConfig {
  client: Params[0];
  coordinator: Hex | undefined;
  tokenAddress: Hex | undefined;
}

export interface UseWrapperForTokenSuspenseConfig {
  client: Params[0];
  coordinator: Hex;
  tokenAddress: Hex;
}

export function useWrapperForToken(config: UseWrapperForTokenConfig) {
  const { client, coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperForToken", client, coordinator, tokenAddress],
    queryFn: () => readWrapperForTokenContract(client, coordinator as Hex, tokenAddress as Hex),
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
