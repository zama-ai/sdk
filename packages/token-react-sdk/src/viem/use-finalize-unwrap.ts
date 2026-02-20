"use client";

import { useMutation } from "@tanstack/react-query";
import { writeFinalizeUnwrapContract } from "@zama-fhe/token-sdk/viem";

type WriteFn = typeof writeFinalizeUnwrapContract;
type Params = Parameters<WriteFn>;

export type FinalizeUnwrapParams = {
  client: Params[0];
  wrapper: Params[1];
  burntAmount: Params[2];
  burntAmountCleartext: Params[3];
  decryptionProof: Params[4];
};

export function useFinalizeUnwrap() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, FinalizeUnwrapParams>(
    {
      mutationFn: (params) =>
        writeFinalizeUnwrapContract(
          params.client,
          params.wrapper,
          params.burntAmount,
          params.burntAmountCleartext,
          params.decryptionProof,
        ),
    },
  );
}
