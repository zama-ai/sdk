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
  const contract = getWrapperContract(coordinator as Address, tokenAddress as Address);
  return useReadContract({ ...contract, query: { enabled } });
}
