"use client";

import {
  useQuery,
  useSuspenseQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { totalSupplyContract, type Address } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

export const totalSupplyQueryKeys = {
  all: ["totalSupply"] as const,
  token: (tokenAddress: string) => ["totalSupply", tokenAddress] as const,
} as const;

export function useTotalSupply(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
): UseQueryResult<bigint, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useQuery<bigint, Error>({
    queryKey: totalSupplyQueryKeys.token(tokenAddress),
    queryFn: () => token.signer.readContract<bigint>(totalSupplyContract(tokenAddress)),
    staleTime: 30_000,
    ...options,
  });
}

export function useTotalSupplySuspense(
  tokenAddress: Address,
): UseSuspenseQueryResult<bigint, Error> {
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<bigint, Error>({
    queryKey: totalSupplyQueryKeys.token(tokenAddress),
    queryFn: () => token.signer.readContract<bigint>(totalSupplyContract(tokenAddress)),
    staleTime: 30_000,
  });
}
