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
  const contract = enabled ? supportsInterfaceContract(tokenAddress, interfaceId) : {};
  return useReadContract({ ...contract, query: { enabled } });
}

export interface UseSupportsInterfaceSuspenseConfig {
  tokenAddress: Address;
  interfaceId: Address;
}

export function useSupportsInterfaceSuspense(config: UseSupportsInterfaceSuspenseConfig) {
  const contract = supportsInterfaceContract(config.tokenAddress, config.interfaceId);
  return useReadContract({ ...contract, query: { suspense: true } });
}
