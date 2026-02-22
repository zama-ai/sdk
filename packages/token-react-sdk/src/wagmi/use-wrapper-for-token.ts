"use client";

import { getWrapperContract } from "@zama-fhe/token-sdk";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export function useWrapperForToken(coordinator: Hex | undefined, tokenAddress: Hex | undefined) {
  const enabled = !!coordinator && !!tokenAddress;
  const contract = getWrapperContract(coordinator as Hex, tokenAddress as Hex);
  return useReadContract({ ...contract, query: { enabled } });
}
