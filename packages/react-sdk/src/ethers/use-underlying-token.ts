"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Provider, Signer } from "ethers";
import { readUnderlyingTokenContract } from "@zama-fhe/sdk/ethers";

export interface UseUnderlyingZamaConfig {
  provider: Provider | Signer;
  wrapperAddress: Address | undefined;
}

export interface UseUnderlyingTokenSuspenseConfig {
  provider: Provider | Signer;
  wrapperAddress: Address;
}

export function useUnderlyingToken(config: UseUnderlyingZamaConfig) {
  const { provider, wrapperAddress } = config;
  const enabled = !!wrapperAddress;
  return useQuery({
    queryKey: ["underlyingToken", provider, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(provider, wrapperAddress as Address),
    enabled,
  });
}

export function useUnderlyingTokenSuspense(config: UseUnderlyingTokenSuspenseConfig) {
  const { provider, wrapperAddress } = config;
  return useSuspenseQuery({
    queryKey: ["underlyingToken", provider, wrapperAddress],
    queryFn: () => readUnderlyingTokenContract(provider, wrapperAddress),
  });
}
