"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useToken, type UseTokenConfig } from "./use-token";

export const confidentialIsApprovedQueryKeys = {
  all: ["confidentialIsApproved"] as const,
  token: (tokenAddress: string) => ["confidentialIsApproved", tokenAddress] as const,
  spender: (tokenAddress: string, spender: string) =>
    ["confidentialIsApproved", tokenAddress, spender] as const,
} as const;

export interface UseConfidentialIsApprovedConfig extends UseTokenConfig {
  spender: Address | undefined;
}

export interface UseConfidentialIsApprovedSuspenseConfig extends UseTokenConfig {
  spender: Address;
}

export function useConfidentialIsApproved(
  config: UseConfidentialIsApprovedConfig,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
) {
  const { spender, ...tokenConfig } = config;
  const token = useToken(tokenConfig);

  return useQuery<boolean, Error>({
    queryKey: confidentialIsApprovedQueryKeys.spender(config.tokenAddress, spender ?? ""),
    queryFn: () => token.isApproved(spender as Address),
    enabled: !!spender,
    staleTime: 30_000,
    ...options,
  });
}

export function useConfidentialIsApprovedSuspense(config: UseConfidentialIsApprovedSuspenseConfig) {
  const { spender, ...tokenConfig } = config;
  const token = useToken(tokenConfig);

  return useSuspenseQuery<boolean, Error>({
    queryKey: confidentialIsApprovedQueryKeys.spender(config.tokenAddress, spender),
    queryFn: () => token.isApproved(spender),
    staleTime: 30_000,
  });
}
