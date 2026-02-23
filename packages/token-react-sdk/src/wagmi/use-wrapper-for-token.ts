"use client";

import { getWrapperContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseWrapperForTokenConfig {
  coordinator: Address | undefined;
  tokenAddress: Address | undefined;
}

export function useWrapperForToken(config: UseWrapperForTokenConfig) {
  const { coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  const contract = enabled ? getWrapperContract(coordinator, tokenAddress) : {};
  return useReadContract({ ...contract, query: { enabled } });
}

export interface UseWrapperForTokenSuspenseConfig {
  coordinator: Address;
  tokenAddress: Address;
}

export function useWrapperForTokenSuspense(config: UseWrapperForTokenSuspenseConfig) {
  const contract = getWrapperContract(config.coordinator, config.tokenAddress);
  return useReadContract({ ...contract, query: { suspense: true } });
}
