"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Provider, Signer } from "ethers";
import { readConfidentialBalanceOfContract } from "@zama-fhe/sdk/ethers";

export interface UseConfidentialBalanceOfConfig {
  provider: Provider | Signer;
  tokenAddress: Address | undefined;
  userAddress: Address | undefined;
}

export interface UseConfidentialBalanceOfSuspenseConfig {
  provider: Provider | Signer;
  tokenAddress: Address;
  userAddress: Address;
}

export function useConfidentialBalanceOf(config: UseConfidentialBalanceOfConfig) {
  const { provider, tokenAddress, userAddress } = config;
  const enabled = !!tokenAddress && !!userAddress;
  return useQuery({
    queryKey: ["confidentialBalanceOf", provider, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(provider, tokenAddress as Address, userAddress as Address),
    enabled,
  });
}

export function useConfidentialBalanceOfSuspense(config: UseConfidentialBalanceOfSuspenseConfig) {
  const { provider, tokenAddress, userAddress } = config;
  return useSuspenseQuery({
    queryKey: ["confidentialBalanceOf", provider, tokenAddress, userAddress],
    queryFn: () => readConfidentialBalanceOfContract(provider, tokenAddress, userAddress),
  });
}
