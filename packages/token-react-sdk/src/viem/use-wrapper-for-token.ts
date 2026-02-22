"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readWrapperForTokenContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readWrapperForTokenContract>;

export function useWrapperForToken(
  client: Params[0],
  coordinator: Params[1] | undefined,
  tokenAddress: Params[2] | undefined,
) {
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperForToken", client, coordinator, tokenAddress],
    queryFn: () => readWrapperForTokenContract(client, coordinator as Hex, tokenAddress as Hex),
    enabled,
  });
}

export function useWrapperForTokenSuspense(
  client: Params[0],
  coordinator: Params[1],
  tokenAddress: Params[2],
) {
  return useSuspenseQuery({
    queryKey: ["wrapperForToken", client, coordinator, tokenAddress],
    queryFn: () => readWrapperForTokenContract(client, coordinator, tokenAddress),
  });
}
