"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { WalletClient } from "viem";
import { writeUnwrapContract } from "@zama-fhe/sdk/viem";

export interface UnwrapParams {
  client: WalletClient;
  encryptedErc20: Address;
  from: Address;
  to: Address;
  encryptedAmount: Uint8Array;
  inputProof: Uint8Array;
}
export function useUnwrap() {
  return useMutation<Awaited<ReturnType<typeof writeUnwrapContract>>, Error, UnwrapParams>({
    mutationFn: (params) =>
      writeUnwrapContract(
        params.client,
        params.encryptedErc20,
        params.from,
        params.to,
        params.encryptedAmount,
        params.inputProof,
      ),
  });
}
