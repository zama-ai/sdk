"use client";

import { supportsInterfaceContract } from "@zama-fhe/token-sdk";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export interface UseSupportsInterfaceConfig {
  tokenAddress: Hex | undefined;
  interfaceId: Hex | undefined;
}

export function useSupportsInterface(config: UseSupportsInterfaceConfig) {
  const { tokenAddress, interfaceId } = config;
  const enabled = !!tokenAddress && !!interfaceId;
  const contract = supportsInterfaceContract(tokenAddress as Hex, interfaceId as Hex);
  return useReadContract({ ...contract, query: { enabled } });
}
