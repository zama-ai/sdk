"use client";

import { confidentialBalanceOfContract } from "@zama-fhe/token-sdk";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseConfidentialBalanceOfConfig {
  tokenAddress: Hex | undefined;
  userAddress: Hex | undefined;
}

export function useConfidentialBalanceOf(config: UseConfidentialBalanceOfConfig) {
  const { tokenAddress, userAddress } = config;
  const enabled = !!tokenAddress && !!userAddress;
  const contract = confidentialBalanceOfContract(tokenAddress as Hex, userAddress as Hex);
  return useReadContract({ ...contract, query: { enabled } });
}
