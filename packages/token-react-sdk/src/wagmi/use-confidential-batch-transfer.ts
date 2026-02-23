"use client";

import { confidentialBatchTransferContract } from "@zama-fhe/token-sdk";
import { useWriteContract } from "wagmi";

type BatchTransferParameters = Parameters<typeof confidentialBatchTransferContract>;

export function useConfidentialBatchTransfer() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function batchTransfer(
    batcherAddress: BatchTransferParameters[0],
    tokenAddress: BatchTransferParameters[1],
    fromAddress: BatchTransferParameters[2],
    batchTransferData: BatchTransferParameters[3],
    fees: BatchTransferParameters[4],
  ) {
    return mutate(
      confidentialBatchTransferContract(
        batcherAddress,
        tokenAddress,
        fromAddress,
        batchTransferData,
        fees,
      ),
    );
  }

  async function batchTransferAsync(
    batcherAddress: BatchTransferParameters[0],
    tokenAddress: BatchTransferParameters[1],
    fromAddress: BatchTransferParameters[2],
    batchTransferData: BatchTransferParameters[3],
    fees: BatchTransferParameters[4],
  ) {
    return mutateAsync(
      confidentialBatchTransferContract(
        batcherAddress,
        tokenAddress,
        fromAddress,
        batchTransferData,
        fees,
      ),
    );
  }

  return {
    mutate: batchTransfer,
    mutateAsync: batchTransferAsync,
    ...mutation,
  };
}
