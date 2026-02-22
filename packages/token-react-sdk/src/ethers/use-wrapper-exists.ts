"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readWrapperExistsContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readWrapperExistsContract>;

export function useWrapperExists(
  provider: Params[0],
  coordinator: Params[1] | undefined,
  tokenAddress: Params[2] | undefined,
) {
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperExists", provider, coordinator, tokenAddress],
    queryFn: () => readWrapperExistsContract(provider, coordinator as Hex, tokenAddress as Hex),
    enabled,
  });
}

export function useWrapperExistsSuspense(
  provider: Params[0],
  coordinator: Params[1],
  tokenAddress: Params[2],
) {
  return useSuspenseQuery({
    queryKey: ["wrapperExists", provider, coordinator, tokenAddress],
    queryFn: () => readWrapperExistsContract(provider, coordinator, tokenAddress),
  });
}
