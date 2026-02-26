"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { PublicClient } from "viem";
import { readWrapperExistsContract } from "@zama-fhe/sdk/viem";

export interface UseWrapperExistsConfig {
  client: PublicClient;
  coordinator: Address | undefined;
  tokenAddress: Address | undefined;
}

export interface UseWrapperExistsSuspenseConfig {
  client: PublicClient;
  coordinator: Address;
  tokenAddress: Address;
}

export function useWrapperExists(config: UseWrapperExistsConfig) {
  const { client, coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  return useQuery({
    queryKey: ["wrapperExists", client, coordinator, tokenAddress],
    queryFn: () =>
      readWrapperExistsContract(client, coordinator as Address, tokenAddress as Address),
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
