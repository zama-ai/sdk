"use client";

import { wrapperExistsContract } from "@zama-fhe/token-sdk";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export function useWrapperExists(coordinator: Hex | undefined, tokenAddress: Hex | undefined) {
  const enabled = !!coordinator && !!tokenAddress;
  const contract = wrapperExistsContract(coordinator as Hex, tokenAddress as Hex);
  return useReadContract({ ...contract, query: { enabled } });
}
