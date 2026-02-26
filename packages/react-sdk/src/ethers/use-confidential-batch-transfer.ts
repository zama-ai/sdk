"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address, BatchTransferData } from "@zama-fhe/sdk";
import type { Signer } from "ethers";
import { writeConfidentialBatchTransferContract } from "@zama-fhe/sdk/ethers";

export interface ConfidentialBatchTransferParams {
  signer: Signer;
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
        params.signer,
        params.batcherAddress,
        params.tokenAddress,
        params.fromAddress,
        params.batchTransferData,
        params.fees,
      ),
  });
}
