"use client";

import { confidentialBalanceOfContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseConfidentialBalanceOfConfig {
  tokenAddress: Address | undefined;
  userAddress: Address | undefined;
}

export function useConfidentialBalanceOf(config: UseConfidentialBalanceOfConfig) {
  const { tokenAddress, userAddress } = config;
  const enabled = !!tokenAddress && !!userAddress;
  const contract = confidentialBalanceOfContract(tokenAddress as Address, userAddress as Address);
  return useReadContract({ ...contract, query: { enabled } });
}
