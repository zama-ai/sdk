"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { readConfidentialBalanceOfContract } from "@zama-fhe/token-sdk/viem";

type Params = Parameters<typeof readConfidentialBalanceOfContract>;

export function useConfidentialBalanceOf(
  client: Params[0],
  tokenAddress: Params[1] | undefined,
  userAddress: Params[2] | undefined,
) {
  const enabled = !!tokenAddress && !!userAddress;
  return useQuery({
    queryKey: ["confidentialBalanceOf", client, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(client, tokenAddress as Hex, userAddress as Hex),
    enabled,
  });
}

export function useConfidentialBalanceOfSuspense(
  client: Params[0],
  tokenAddress: Params[1],
  userAddress: Params[2],
) {
  return useSuspenseQuery({
    queryKey: ["confidentialBalanceOf", client, tokenAddress, userAddress],
    queryFn: () =>
      readConfidentialBalanceOfContract(client, tokenAddress as Hex, userAddress as Hex),
  });
}
