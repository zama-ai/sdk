"use client";

import { supportsInterfaceContract } from "@zama-fhe/token-sdk";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export function useSupportsInterface(tokenAddress: Hex | undefined, interfaceId: Hex | undefined) {
  const enabled = !!tokenAddress && !!interfaceId;
  const contract = supportsInterfaceContract(tokenAddress as Hex, interfaceId as Hex);
  return useReadContract({ ...contract, query: { enabled } });
}
