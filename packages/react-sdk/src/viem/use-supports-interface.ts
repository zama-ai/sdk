"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { readSupportsInterfaceContract } from "@zama-fhe/sdk/viem";

type Params = Parameters<typeof readSupportsInterfaceContract>;

export interface UseSupportsInterfaceConfig {
  client: Params[0];
  tokenAddress: Params[1] | undefined;
  interfaceId: Params[2] | undefined;
}

export interface UseSupportsInterfaceSuspenseConfig {
  client: Params[0];
  tokenAddress: Params[1];
  interfaceId: Params[2];
}

export function useSupportsInterface(config: UseSupportsInterfaceConfig) {
  const { client, tokenAddress, interfaceId } = config;
  const enabled = !!tokenAddress && !!interfaceId;
  return useQuery({
    queryKey: ["supportsInterface", client, tokenAddress, interfaceId],
    queryFn: () =>
      readSupportsInterfaceContract(client, tokenAddress as Params[1], interfaceId as Params[2]),
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
