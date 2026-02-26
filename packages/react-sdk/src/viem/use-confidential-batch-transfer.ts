"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address, BatchTransferData } from "@zama-fhe/sdk";
import type { WalletClient } from "viem";
import { writeConfidentialBatchTransferContract } from "@zama-fhe/sdk/viem";

export interface ConfidentialBatchTransferParams {
  client: WalletClient;
  batcherAddress: Address;
  tokenAddress: Address;
  fromAddress: Address;
  batchTransferData: BatchTransferData[];
  fees: bigint;
}
export function useConfidentialBatchTransfer() {
  return useMutation<
    Awaited<ReturnType<typeof writeConfidentialBatchTransferContract>>,
    Error,
    ConfidentialBatchTransferParams
  >({
    mutationFn: (params) =>
      writeConfidentialBatchTransferContract(
        params.client,
        params.batcherAddress,
        params.tokenAddress,
        params.fromAddress,
        params.batchTransferData,
        params.fees,
      ),
  });
}
