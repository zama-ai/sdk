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
  const contract = underlyingContract(wrapperAddress as Address);
  return useReadContract({ ...contract, query: { enabled } });
}
