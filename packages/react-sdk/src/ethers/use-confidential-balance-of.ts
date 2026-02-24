"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { readConfidentialBalanceOfContract } from "@zama-fhe/sdk/ethers";

type Params = Parameters<typeof readConfidentialBalanceOfContract>;

export interface UseConfidentialBalanceOfConfig {
  provider: Params[0];
  tokenAddress: Address | undefined;
  userAddress: Address | undefined;
}

export interface UseConfidentialBalanceOfSuspenseConfig {
  provider: Params[0];
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
