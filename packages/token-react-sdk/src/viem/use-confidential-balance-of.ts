"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readConfidentialBalanceOfContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readConfidentialBalanceOfContract>;

export interface UseConfidentialBalanceOfConfig {
  client: Params[0];
  tokenAddress: Hex | undefined;
  userAddress: Hex | undefined;
}

export interface UseConfidentialBalanceOfSuspenseConfig {
  client: Params[0];
  tokenAddress: Hex;
  userAddress: Hex;
}

export function useConfidentialBalanceOf(config: UseConfidentialBalanceOfConfig) {
  const { client, tokenAddress, userAddress } = config;
  const enabled = !!tokenAddress && !!userAddress;
  return useQuery({
    queryKey: ["confidentialBalanceOf", client, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(client, tokenAddress as Hex, userAddress as Hex),
    enabled,
  });
}

export function useConfidentialBalanceOfSuspense(config: UseConfidentialBalanceOfSuspenseConfig) {
  const { client, tokenAddress, userAddress } = config;
  return useSuspenseQuery({
    queryKey: ["confidentialBalanceOf", client, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(client, tokenAddress as Hex, userAddress as Hex),
  });
}
