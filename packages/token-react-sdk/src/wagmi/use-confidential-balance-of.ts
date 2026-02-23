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

export interface UseConfidentialBalanceOfSuspenseConfig {
  tokenAddress: Address;
  userAddress: Address;
}

export function useConfidentialBalanceOfSuspense(config: UseConfidentialBalanceOfSuspenseConfig) {
  const contract = confidentialBalanceOfContract(config.tokenAddress, config.userAddress);
  return useReadContract({ ...contract, query: { suspense: true } });
}
