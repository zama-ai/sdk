"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readUnderlyingTokenContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readUnderlyingTokenContract>;

export function useUnderlyingToken(client: Params[0], wrapperAddress: Params[1] | undefined) {
  const enabled = !!wrapperAddress;
  return useQuery({
    queryKey: ["underlyingToken", client, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(client, wrapperAddress as Hex),
    enabled,
  });
}

export function useUnderlyingTokenSuspense(client: Params[0], wrapperAddress: Params[1]) {
  return useSuspenseQuery({
    queryKey: ["underlyingToken", client, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(client, wrapperAddress),
  });
}
