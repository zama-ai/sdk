"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readConfidentialBalanceOfContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readConfidentialBalanceOfContract>;

export interface UseConfidentialBalanceOfConfig {
  provider: Params[0];
  tokenAddress: Hex | undefined;
  userAddress: Hex | undefined;
}

export interface UseConfidentialBalanceOfSuspenseConfig {
  provider: Params[0];
  tokenAddress: Hex;
  userAddress: Hex;
}

export function useConfidentialBalanceOf(config: UseConfidentialBalanceOfConfig) {
  const { provider, tokenAddress, userAddress } = config;
  const enabled = !!tokenAddress && !!userAddress;
  return useQuery({
    queryKey: ["confidentialBalanceOf", provider, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(provider, tokenAddress as Hex, userAddress as Hex),
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
