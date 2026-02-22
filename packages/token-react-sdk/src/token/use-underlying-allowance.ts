"use client";

import { useQuery, useSuspenseQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyConfidentialToken } from "./use-readonly-confidential-token";

export const underlyingAllowanceQueryKeys = {
  all: ["underlyingAllowance"] as const,
  token: (tokenAddress: string, wrapper: string) =>
    ["underlyingAllowance", tokenAddress, wrapper] as const,
} as const;

export function useUnderlyingAllowance(
  encryptedErc20Address: Address,
  encryptedErc20Wrapper: Address,
  options?: Omit<UseQueryOptions<bigint, Error>, "queryKey" | "queryFn">,
) {
  const token = useReadonlyConfidentialToken(encryptedErc20Address);

  return useQuery<bigint, Error>({
    queryKey: underlyingAllowanceQueryKeys.token(encryptedErc20Address, encryptedErc20Wrapper),
    queryFn: () => token.allowance(encryptedErc20Wrapper),
    ...options,
  });
}

export function useUnderlyingAllowanceSuspense(
  encryptedErc20Address: Address,
  encryptedErc20Wrapper: Address,
) {
  const token = useReadonlyConfidentialToken(encryptedErc20Address);

  return useSuspenseQuery<bigint, Error>({
    queryKey: underlyingAllowanceQueryKeys.token(encryptedErc20Address, encryptedErc20Wrapper),
    queryFn: () => token.allowance(encryptedErc20Wrapper),
  });
}
