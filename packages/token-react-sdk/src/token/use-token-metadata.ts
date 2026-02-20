"use client";

import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadonlyConfidentialToken } from "./use-readonly-confidential-token";

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * Declarative hook to read ERC-20 token metadata (name, symbol, decimals).
 * Fetches all three in parallel. Results are cached indefinitely since metadata doesn't change.
 */
export function useTokenMetadata(
  tokenAddress: Address,
  options?: Omit<UseQueryOptions<TokenMetadata, Error>, "queryKey" | "queryFn">,
): UseQueryResult<TokenMetadata, Error> {
  const token = useReadonlyConfidentialToken(tokenAddress);

  return useQuery<TokenMetadata, Error>({
    queryKey: ["tokenMetadata", tokenAddress],
    queryFn: async () => {
      const [name, symbol, decimals] = await Promise.all([
        token.name(),
        token.symbol(),
        token.decimals(),
      ]);
      return { name, symbol, decimals };
    },
    staleTime: Infinity,
    ...options,
  });
}
