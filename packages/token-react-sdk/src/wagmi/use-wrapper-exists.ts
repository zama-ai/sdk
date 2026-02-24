"use client";

import { wrapperExistsContract } from "@zama-fhe/sdk";
import type { Address } from "@zama-fhe/sdk";
import { useReadContract } from "wagmi";

export interface UseWrapperExistsConfig {
  coordinator: Address | undefined;
  tokenAddress: Address | undefined;
}

export function useWrapperExists(config: UseWrapperExistsConfig) {
  const { coordinator, tokenAddress } = config;
  const enabled = !!coordinator && !!tokenAddress;
  const contract = enabled ? wrapperExistsContract(coordinator, tokenAddress) : {};
  return useReadContract({ ...contract, query: { enabled } });
}

export interface UseWrapperExistsSuspenseConfig {
  coordinator: Address;
  tokenAddress: Address;
}

export function useWrapperExistsSuspense(config: UseWrapperExistsSuspenseConfig) {
  const contract = wrapperExistsContract(config.coordinator, config.tokenAddress);
  return useReadContract({ ...contract, query: { suspense: true } });
}
