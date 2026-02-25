"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { WalletClient } from "viem";
import { writeSetOperatorContract } from "@zama-fhe/sdk/viem";

export interface SetOperatorParams {
  client: WalletClient;
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
        params.client,
        params.tokenAddress,
        params.spender,
        params.timestamp,
      ),
  });
}
