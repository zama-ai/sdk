"use client";

import { supportsInterfaceContract } from "@zama-fhe/token-sdk";
import type { Address } from "@zama-fhe/token-sdk";
import { useReadContract } from "wagmi";

export function useSupportsInterface(
  tokenAddress: Address | undefined,
  interfaceId: Address | undefined,
) {
  const enabled = !!tokenAddress && !!interfaceId;
  const contract = supportsInterfaceContract(
    tokenAddress as Address,
    interfaceId as Address,
  );
  return useReadContract({ ...contract, query: { enabled } });
}
