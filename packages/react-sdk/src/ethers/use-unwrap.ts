"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Signer } from "ethers";
import { writeUnwrapContract } from "@zama-fhe/sdk/ethers";

export interface UnwrapParams {
  signer: Signer;
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
        params.signer,
        params.encryptedErc20,
        params.from,
        params.to,
        params.encryptedAmount,
        params.inputProof,
      ),
  });
}
