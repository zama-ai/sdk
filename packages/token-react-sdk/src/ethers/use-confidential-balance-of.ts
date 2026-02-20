"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { readConfidentialBalanceOfContract } from "@zama-fhe/token-sdk/ethers";

type Params = Parameters<typeof readConfidentialBalanceOfContract>;

export function useConfidentialBalanceOf(
  provider: Params[0],
  tokenAddress: Params[1] | undefined,
  userAddress: Params[2] | undefined,
) {
  const enabled = !!tokenAddress && !!userAddress;
  return useQuery({
    queryKey: ["confidentialBalanceOf", provider, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(
        provider,
        tokenAddress as Address,
        userAddress as Address,
      ),
    enabled,
  });
}

export function useConfidentialBalanceOfSuspense(
  provider: Params[0],
  tokenAddress: Params[1],
  userAddress: Params[2],
) {
  return useSuspenseQuery({
    queryKey: ["confidentialBalanceOf", provider, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(provider, tokenAddress, userAddress),
  });
}
