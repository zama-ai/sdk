"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Signer } from "ethers";
import { writeSetOperatorContract } from "@zama-fhe/sdk/ethers";

export interface SetOperatorParams {
  signer: Signer;
  tokenAddress: Address;
  spender: Address;
  timestamp?: number;
}
export function useSetOperator() {
  return useMutation<
    Awaited<ReturnType<typeof writeSetOperatorContract>>,
    Error,
    SetOperatorParams
  >({
    mutationFn: (params) =>
      writeSetOperatorContract(
        params.signer,
        params.tokenAddress,
        params.spender,
        params.timestamp,
      ),
  });
}
