"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { WalletClient } from "viem";
import { writeConfidentialTransferContract } from "@zama-fhe/sdk/viem";

export interface ConfidentialTransferParams {
  client: WalletClient;
  tokenAddress: Address;
  to: Address;
  handle: Uint8Array;
  inputProof: Uint8Array;
}
export function useConfidentialTransfer() {
  return useMutation<
    Awaited<ReturnType<typeof writeConfidentialTransferContract>>,
    Error,
    ConfidentialTransferParams
  >({
    mutationFn: (params) =>
      writeConfidentialTransferContract(
        params.client,
        params.tokenAddress,
        params.to,
        params.handle,
        params.inputProof,
      ),
  });
}
