"use client";

import { useMutation } from "@tanstack/react-query";
import { writeFinalizeUnwrapContract } from "@zama-fhe/token-sdk/ethers";

type WriteFn = typeof writeFinalizeUnwrapContract;
type Params = Parameters<WriteFn>;

export interface FinalizeUnwrapParams {
  signer: Params[0];
  wrapper: Params[1];
  burntAmount: Params[2];
  burntAmountCleartext: Params[3];
  decryptionProof: Params[4];
}
export function useFinalizeUnwrap() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, FinalizeUnwrapParams>({
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
