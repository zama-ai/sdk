"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Provider, Signer } from "ethers";
import { readSupportsInterfaceContract } from "@zama-fhe/sdk/ethers";

export interface UseSupportsInterfaceConfig {
  provider: Provider | Signer;
  tokenAddress: Address | undefined;
  interfaceId: Address | undefined;
}

export interface UseSupportsInterfaceSuspenseConfig {
  provider: Provider | Signer;
  tokenAddress: Address;
  interfaceId: Address;
}

export function useSupportsInterface(config: UseSupportsInterfaceConfig) {
  const { provider, tokenAddress, interfaceId } = config;
  const enabled = !!tokenAddress && !!interfaceId;
  return useQuery({
    queryKey: ["supportsInterface", provider, tokenAddress, interfaceId],
    queryFn: () =>
      readSupportsInterfaceContract(provider, tokenAddress as Address, interfaceId as Address),
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
