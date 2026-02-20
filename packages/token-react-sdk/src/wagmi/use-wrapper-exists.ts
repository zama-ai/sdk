"use client";

import { wrapperExistsContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export function useWrapperExists(
  coordinator: Address | undefined,
  tokenAddress: Address | undefined,
) {
  const enabled = !!coordinator && !!tokenAddress;
  const contract = wrapperExistsContract(
    coordinator as Address,
    tokenAddress as Address,
  );
  return useReadContract({ ...contract, query: { enabled } });
}
