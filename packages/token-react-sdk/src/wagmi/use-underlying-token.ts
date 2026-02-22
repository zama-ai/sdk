"use client";

import { underlyingContract } from "@zama-fhe/token-sdk";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseUnderlyingTokenConfig {
  wrapperAddress: Hex | undefined;
}

export function useUnderlyingToken(config: UseUnderlyingTokenConfig) {
  const { wrapperAddress } = config;
  const enabled = !!wrapperAddress;
  const contract = underlyingContract(wrapperAddress as Hex);
  return useReadContract({ ...contract, query: { enabled } });
}
