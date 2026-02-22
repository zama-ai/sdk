"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readUnderlyingTokenContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readUnderlyingTokenContract>;

export interface UseUnderlyingTokenConfig {
  provider: Params[0];
  wrapperAddress: Hex | undefined;
}

export interface UseUnderlyingTokenSuspenseConfig {
  provider: Params[0];
  wrapperAddress: Hex;
}

export function useUnderlyingToken(config: UseUnderlyingTokenConfig) {
  const { provider, wrapperAddress } = config;
  const enabled = !!wrapperAddress;
  return useQuery({
    queryKey: ["underlyingToken", provider, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(provider, wrapperAddress as Hex),
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
