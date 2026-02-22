"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readWrapperExistsContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readWrapperExistsContract>;

export interface UseWrapperExistsConfig {
  client: Params[0];
  coordinator: Hex | undefined;
  tokenAddress: Hex | undefined;
}

export interface UseWrapperExistsSuspenseConfig {
  client: Params[0];
  coordinator: Hex;
  tokenAddress: Hex;
}

export function useWrapperExists(config: UseWrapperExistsConfig) {
  const { client, coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperExists", client, coordinator, tokenAddress],
    queryFn: () => readWrapperExistsContract(client, coordinator as Hex, tokenAddress as Hex),
    enabled,
  });
}

export function useWrapperExistsSuspense(config: UseWrapperExistsSuspenseConfig) {
  const { client, coordinator, tokenAddress } = config;
  return useSuspenseQuery({
    queryKey: ["wrapperExists", client, coordinator, tokenAddress],
    queryFn: () => readWrapperExistsContract(client, coordinator, tokenAddress),
  });
}
