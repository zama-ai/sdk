"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readUnderlyingTokenContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readUnderlyingTokenContract>;

export function useUnderlyingToken(provider: Params[0], wrapperAddress: Params[1] | undefined) {
  const enabled = !!wrapperAddress;
  return useQuery({
    queryKey: ["underlyingToken", provider, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(provider, wrapperAddress as Hex),
    enabled,
  });
}

export function useUnderlyingTokenSuspense(provider: Params[0], wrapperAddress: Params[1]) {
  return useSuspenseQuery({
    queryKey: ["underlyingToken", provider, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(provider, wrapperAddress),
  });
}
