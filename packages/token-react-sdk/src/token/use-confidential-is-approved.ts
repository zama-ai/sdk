"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useToken, type UseTokenConfig } from "./use-token";

export function useConfidentialIsApproved(
  config: UseTokenConfig,
  spender: Address | undefined,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
) {
  const token = useToken(config);

  return useQuery<boolean, Error>({
    queryKey: ["confidentialIsApproved", config.tokenAddress, spender],
    queryFn: () => token.isApproved(spender as Address),
    enabled: !!spender,
    ...options,
  });
}

export function useConfidentialIsApprovedSuspense(config: UseTokenConfig, spender: Address) {
  const token = useToken(config);

  return useSuspenseQuery<boolean, Error>({
    queryKey: ["confidentialIsApproved", config.tokenAddress, spender],
    queryFn: () => token.isApproved(spender),
  });
}
