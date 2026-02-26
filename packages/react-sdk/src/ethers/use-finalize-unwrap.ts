"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Signer } from "ethers";
import { writeFinalizeUnwrapContract } from "@zama-fhe/sdk/ethers";

export interface FinalizeUnwrapParams {
  signer: Signer;
  wrapper: Address;
  burntAmount: Address;
  burntAmountCleartext: bigint;
  decryptionProof: Address;
}
export function useFinalizeUnwrap() {
  return useMutation<
    Awaited<ReturnType<typeof writeFinalizeUnwrapContract>>,
    Error,
    FinalizeUnwrapParams
  >({
    mutationFn: (params) =>
      writeFinalizeUnwrapContract(
        params.signer,
        params.wrapper,
        params.burntAmount,
        params.burntAmountCleartext,
        params.decryptionProof,
      ),
  });
}
