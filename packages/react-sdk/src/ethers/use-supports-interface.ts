"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { readSupportsInterfaceContract } from "@zama-fhe/sdk/ethers";

type Params = Parameters<typeof readSupportsInterfaceContract>;

export interface UseSupportsInterfaceConfig {
  provider: Params[0];
  tokenAddress: Params[1] | undefined;
  interfaceId: Params[2] | undefined;
}

export interface UseSupportsInterfaceSuspenseConfig {
  provider: Params[0];
  tokenAddress: Params[1];
  interfaceId: Params[2];
}

export function useSupportsInterface(config: UseSupportsInterfaceConfig) {
  const { provider, tokenAddress, interfaceId } = config;
  const enabled = !!tokenAddress && !!interfaceId;
  return useQuery({
    queryKey: ["supportsInterface", provider, tokenAddress, interfaceId],
    queryFn: () =>
      readSupportsInterfaceContract(provider, tokenAddress as Params[1], interfaceId as Params[2]),
    enabled,
  });
}

export function useSupportsInterfaceSuspense(config: UseSupportsInterfaceSuspenseConfig) {
  const { provider, tokenAddress, interfaceId } = config;
  return useSuspenseQuery({
    queryKey: ["supportsInterface", provider, tokenAddress, interfaceId],
    queryFn: () => readSupportsInterfaceContract(provider, tokenAddress, interfaceId),
  });
}
