"use client";

import { useMutation } from "@tanstack/react-query";
import { writeConfidentialTransferContract } from "@zama-fhe/sdk/viem";

type WriteFn = typeof writeConfidentialTransferContract;
type Params = Parameters<WriteFn>;

export interface ConfidentialTransferParams {
  client: Params[0];
  tokenAddress: Params[1];
  to: Params[2];
  handle: Params[3];
  inputProof: Params[4];
}
export function useConfidentialTransfer() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, ConfidentialTransferParams>({
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
