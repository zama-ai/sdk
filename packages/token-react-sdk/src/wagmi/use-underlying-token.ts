"use client";

import { underlyingContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseUnderlyingTokenConfig {
  wrapperAddress: Address | undefined;
}

export function useUnderlyingToken(config: UseUnderlyingTokenConfig) {
  const { wrapperAddress } = config;
  const enabled = !!wrapperAddress;
  const contract = enabled ? underlyingContract(wrapperAddress) : {};
  return useReadContract({ ...contract, query: { enabled } });
}

export interface UseUnderlyingTokenSuspenseConfig {
  wrapperAddress: Address;
}

export function useUnderlyingTokenSuspense(config: UseUnderlyingTokenSuspenseConfig) {
  const contract = underlyingContract(config.wrapperAddress);
  return useReadContract({ ...contract, query: { suspense: true } });
}
