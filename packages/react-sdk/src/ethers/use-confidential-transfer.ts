"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Signer } from "ethers";
import { writeConfidentialTransferContract } from "@zama-fhe/sdk/ethers";

export interface ConfidentialTransferParams {
  signer: Signer;
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
        params.signer,
        params.tokenAddress,
        params.to,
        params.handle,
        params.inputProof,
      ),
  });
}
