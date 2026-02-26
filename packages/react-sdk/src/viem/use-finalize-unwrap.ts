"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { WalletClient } from "viem";
import { writeFinalizeUnwrapContract } from "@zama-fhe/sdk/viem";

export interface FinalizeUnwrapParams {
  client: WalletClient;
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
        params.client,
        params.wrapper,
        params.burntAmount,
        params.burntAmountCleartext,
        params.decryptionProof,
      ),
  });
}
