"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { readUnderlyingTokenContract } from "@zama-fhe/sdk/ethers";

type Params = Parameters<typeof readUnderlyingTokenContract>;

export interface UseUnderlyingTokenConfig {
  provider: Params[0];
  wrapperAddress: Address | undefined;
}

export interface UseUnderlyingTokenSuspenseConfig {
  provider: Params[0];
  wrapperAddress: Address;
}

export function useUnderlyingToken(config: UseUnderlyingTokenConfig) {
  const { provider, wrapperAddress } = config;
  const enabled = !!wrapperAddress;
  return useQuery({
    queryKey: ["underlyingToken", provider, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(provider, wrapperAddress as Address),
    enabled,
  });
}

export function useUnderlyingTokenSuspense(config: UseUnderlyingTokenSuspenseConfig) {
  const { provider, wrapperAddress } = config;
  return useSuspenseQuery({
    queryKey: ["underlyingToken", provider, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(provider, wrapperAddress),
  });
}
