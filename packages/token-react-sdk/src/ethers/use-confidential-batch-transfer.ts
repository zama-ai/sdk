"use client";

import { useMutation } from "@tanstack/react-query";
import { writeConfidentialBatchTransferContract } from "@zama-fhe/token-sdk/ethers";

type WriteFn = typeof writeConfidentialBatchTransferContract;
type Params = Parameters<WriteFn>;

export interface ConfidentialBatchTransferParams {
  signer: Params[0];
  batcherAddress: Params[1];
  tokenAddress: Params[2];
  fromAddress: Params[3];
  batchTransferData: Params[4];
  fees: Params[5];
}
export function useConfidentialBatchTransfer() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, ConfidentialBatchTransferParams>({
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
