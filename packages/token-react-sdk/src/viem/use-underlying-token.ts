"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { readUnderlyingTokenContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readUnderlyingTokenContract>;

export interface UseUnderlyingTokenConfig {
  client: Params[0];
  wrapperAddress: Address | undefined;
}

export interface UseUnderlyingTokenSuspenseConfig {
  client: Params[0];
  wrapperAddress: Address;
}

export function useUnderlyingToken(config: UseUnderlyingTokenConfig) {
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
