"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useConfidentialToken, type UseConfidentialTokenConfig } from "./use-confidential-token";

export function useConfidentialIsApproved(
  config: UseConfidentialTokenConfig,
  spender: Address | undefined,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
) {
  const token = useConfidentialToken(config);

  return useQuery<boolean, Error>({
    queryKey: ["confidentialIsApproved", config.tokenAddress, spender],
    queryFn: () => token.isApproved(spender as Address),
    enabled: !!spender,
    ...options,
  });
}

export function useConfidentialIsApprovedSuspense(
  config: UseConfidentialTokenConfig,
  spender: Address,
) {
  const token = useConfidentialToken(config);

  return useSuspenseQuery<boolean, Error>({
    queryKey: ["confidentialIsApproved", config.tokenAddress, spender],
    queryFn: () => token.isApproved(spender),
  });
}
