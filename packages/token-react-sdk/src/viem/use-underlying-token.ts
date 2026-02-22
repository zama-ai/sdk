"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readUnderlyingTokenContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readUnderlyingTokenContract>;

export interface UseUnderlyingTokenConfig {
  client: Params[0];
  wrapperAddress: Hex | undefined;
}

export interface UseUnderlyingTokenSuspenseConfig {
  client: Params[0];
  wrapperAddress: Hex;
}

export function useUnderlyingToken(config: UseUnderlyingTokenConfig) {
  const { client, wrapperAddress } = config;
  const enabled = !!wrapperAddress;
  return useQuery({
    queryKey: ["underlyingToken", client, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(client, wrapperAddress as Hex),
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
