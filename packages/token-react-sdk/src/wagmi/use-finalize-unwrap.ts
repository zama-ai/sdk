"use client";

import { finalizeUnwrapContract } from "@zama-fhe/token-sdk";
import { useWriteContract } from "wagmi";

type FinalizeUnwrapParameters = Parameters<typeof finalizeUnwrapContract>;

export function useFinalizeUnwrap() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function finalizeUnwrap(
    wrapper: FinalizeUnwrapParameters[0],
    burntAmount: FinalizeUnwrapParameters[1],
    burntAmountCleartext: FinalizeUnwrapParameters[2],
    decryptionProof: FinalizeUnwrapParameters[3],
  ) {
    return mutate(
      finalizeUnwrapContract(
        wrapper,
        burntAmount,
        burntAmountCleartext,
        decryptionProof,
      ),
    );
  }

  async function finalizeUnwrapAsync(
    wrapper: FinalizeUnwrapParameters[0],
    burntAmount: FinalizeUnwrapParameters[1],
    burntAmountCleartext: FinalizeUnwrapParameters[2],
    decryptionProof: FinalizeUnwrapParameters[3],
  ) {
    return mutateAsync(
      finalizeUnwrapContract(
        wrapper,
        burntAmount,
        burntAmountCleartext,
        decryptionProof,
      ),
    );
  }

  return {
    mutate: finalizeUnwrap,
    mutateAsync: finalizeUnwrapAsync,
    ...mutation,
  };
}
