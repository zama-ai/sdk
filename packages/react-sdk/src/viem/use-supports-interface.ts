"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { PublicClient } from "viem";
import { readSupportsInterfaceContract } from "@zama-fhe/sdk/viem";

export interface UseSupportsInterfaceConfig {
  client: PublicClient;
  tokenAddress: Address | undefined;
  interfaceId: Address | undefined;
}

export interface UseSupportsInterfaceSuspenseConfig {
  client: PublicClient;
  tokenAddress: Address;
  interfaceId: Address;
}

export function useSupportsInterface(config: UseSupportsInterfaceConfig) {
  const { client, tokenAddress, interfaceId } = config;
  const enabled = !!tokenAddress && !!interfaceId;
  return useQuery({
    queryKey: ["supportsInterface", client, tokenAddress, interfaceId],
    queryFn: () =>
      readSupportsInterfaceContract(client, tokenAddress as Address, interfaceId as Address),
    enabled,
  });
}

export function useSupportsInterfaceSuspense(config: UseSupportsInterfaceSuspenseConfig) {
  const { client, tokenAddress, interfaceId } = config;
  return useSuspenseQuery({
    queryKey: ["supportsInterface", client, tokenAddress, interfaceId],
    queryFn: () => readSupportsInterfaceContract(client, tokenAddress, interfaceId),
  });
}
