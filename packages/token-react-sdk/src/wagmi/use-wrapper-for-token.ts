"use client";

import { getWrapperContract } from "@zama-fhe/token-sdk";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseWrapperForTokenConfig {
  coordinator: Hex | undefined;
  tokenAddress: Hex | undefined;
}

export function useWrapperForToken(config: UseWrapperForTokenConfig) {
  const { coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  const contract = getWrapperContract(coordinator as Hex, tokenAddress as Hex);
  return useReadContract({ ...contract, query: { enabled } });
}
