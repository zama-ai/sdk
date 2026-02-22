"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyToken } from "./use-readonly-token";

export const underlyingAllowanceQueryKeys = {
  all: ["underlyingAllowance"] as const,
  token: (tokenAddress: string, wrapper: string) =>
    ["underlyingAllowance", tokenAddress, wrapper] as const,
} as const;

export interface UseUnderlyingAllowanceConfig {
  tokenAddress: Address;
  wrapperAddress: Address;
}

export function useUnderlyingAllowance(
  config: UseUnderlyingAllowanceConfig,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, wrapperAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useQuery<bigint, Error>({
    queryKey: underlyingAllowanceQueryKeys.token(tokenAddress, wrapperAddress),
    queryFn: () => token.allowance(wrapperAddress),
    staleTime: 30_000,
    ...options,
  });
}

export function useUnderlyingAllowanceSuspense(config: UseUnderlyingAllowanceConfig) {
  const { tokenAddress, wrapperAddress } = config;
  const token = useReadonlyToken(tokenAddress);

  return useSuspenseQuery<bigint, Error>({
    queryKey: underlyingAllowanceQueryKeys.token(tokenAddress, wrapperAddress),
    queryFn: () => token.allowance(wrapperAddress),
    staleTime: 30_000,
  });
}
