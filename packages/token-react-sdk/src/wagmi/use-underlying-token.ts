"use client";

import { underlyingContract } from "@zama-fhe/token-sdk";
import type { Hex } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export function useUnderlyingToken(wrapperAddress: Hex | undefined) {
  const enabled = !!wrapperAddress;
  const contract = underlyingContract(wrapperAddress as Hex);
  return useReadContract({ ...contract, query: { enabled } });
}
