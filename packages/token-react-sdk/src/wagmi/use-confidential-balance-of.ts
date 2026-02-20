"use client";

import { confidentialBalanceOfContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export function useConfidentialBalanceOf(
  tokenAddress: Address | undefined,
  userAddress: Address | undefined,
) {
  const enabled = !!tokenAddress && !!userAddress;
  const contract = confidentialBalanceOfContract(
    tokenAddress as Address,
    userAddress as Address,
  );
  return useReadContract({ ...contract, query: { enabled } });
}
