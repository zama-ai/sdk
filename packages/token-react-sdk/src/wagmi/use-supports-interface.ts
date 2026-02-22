"use client";

import { supportsInterfaceContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseSupportsInterfaceConfig {
  tokenAddress: Address | undefined;
  interfaceId: Address | undefined;
}

export function useSupportsInterface(config: UseSupportsInterfaceConfig) {
  const { tokenAddress, interfaceId } = config;
  const enabled = !!tokenAddress && !!interfaceId;
  const contract = supportsInterfaceContract(tokenAddress as Address, interfaceId as Address);
  return useReadContract({ ...contract, query: { enabled } });
}
