"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readWrapperForTokenContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readWrapperForTokenContract>;

export function useWrapperForToken(
  provider: Params[0],
  coordinator: Params[1] | undefined,
  tokenAddress: Params[2] | undefined,
) {
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperForToken", provider, coordinator, tokenAddress],
    queryFn: () => readWrapperForTokenContract(provider, coordinator as Hex, tokenAddress as Hex),
    enabled,
  });
}

export function useWrapperForTokenSuspense(
  provider: Params[0],
  coordinator: Params[1],
  tokenAddress: Params[2],
) {
  return useSuspenseQuery({
    queryKey: ["wrapperForToken", provider, coordinator, tokenAddress],
    queryFn: () => readWrapperForTokenContract(provider, coordinator, tokenAddress),
  });
}
