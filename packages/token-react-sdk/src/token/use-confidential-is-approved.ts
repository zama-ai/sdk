"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Hex } from "@zama-fhe/token-sdk";
import { useToken, type UseTokenConfig } from "./use-token";

export const confidentialIsApprovedQueryKeys = {
  all: ["confidentialIsApproved"] as const,
  token: (tokenAddress: string) => ["confidentialIsApproved", tokenAddress] as const,
  spender: (tokenAddress: string, spender: string) =>
    ["confidentialIsApproved", tokenAddress, spender] as const,
} as const;

export function useConfidentialIsApproved(
  config: UseTokenConfig,
  spender: Hex | undefined,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
) {
  const token = useToken(config);

  return useQuery<boolean, Error>({
    queryKey: ["confidentialIsApproved", config.tokenAddress, spender],
    queryFn: () => token.isApproved(spender as Hex),
    enabled: !!spender,
    staleTime: 30_000,
    ...options,
  });
}

export function useConfidentialIsApprovedSuspense(config: UseTokenConfig, spender: Hex) {
  const token = useToken(config);

  return useSuspenseQuery<boolean, Error>({
    queryKey: ["confidentialIsApproved", config.tokenAddress, spender],
    queryFn: () => token.isApproved(spender),
  });
}
