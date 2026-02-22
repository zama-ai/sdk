"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { readConfidentialBalanceOfContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readConfidentialBalanceOfContract>;

export interface UseConfidentialBalanceOfConfig {
  client: Params[0];
  tokenAddress: Address | undefined;
  userAddress: Address | undefined;
}

export interface UseConfidentialBalanceOfSuspenseConfig {
  client: Params[0];
  tokenAddress: Address;
  userAddress: Address;
}

export function useConfidentialBalanceOf(config: UseConfidentialBalanceOfConfig) {
  const { client, tokenAddress, userAddress } = config;
  const enabled = !!tokenAddress && !!userAddress;
  return useQuery({
    queryKey: ["confidentialBalanceOf", client, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(client, tokenAddress as Address, userAddress as Address),
    enabled,
  });
}

export function useConfidentialBalanceOfSuspense(config: UseConfidentialBalanceOfSuspenseConfig) {
  const { client, tokenAddress, userAddress } = config;
  return useSuspenseQuery({
    queryKey: ["confidentialBalanceOf", client, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(client, tokenAddress as Address, userAddress as Address),
  });
}
