"use client";

import { underlyingContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export function useUnderlyingToken(wrapperAddress: Address | undefined) {
  const enabled = !!wrapperAddress;
  const contract = underlyingContract(wrapperAddress as Address);
  return useReadContract({ ...contract, query: { enabled } });
}
