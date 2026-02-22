"use client";

import { wrapperExistsContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseWrapperExistsConfig {
  coordinator: Address | undefined;
  tokenAddress: Address | undefined;
}

export function useWrapperExists(config: UseWrapperExistsConfig) {
  const { coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  const contract = wrapperExistsContract(coordinator as Address, tokenAddress as Address);
  return useReadContract({ ...contract, query: { enabled } });
}
