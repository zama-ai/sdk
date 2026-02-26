"use client";

import { underlyingContract } from "@zama-fhe/sdk";
import type { Address } from "@zama-fhe/sdk";
import { useReadContract } from "wagmi";

export interface UseUnderlyingZamaConfig {
  wrapperAddress: Address | undefined;
}

export function useUnderlyingToken(config: UseUnderlyingZamaConfig) {
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
