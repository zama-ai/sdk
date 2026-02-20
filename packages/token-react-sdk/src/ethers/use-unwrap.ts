"use client";

import { useMutation } from "@tanstack/react-query";
import { writeUnwrapContract } from "@zama-fhe/token-sdk/ethers";

type WriteFn = typeof writeUnwrapContract;
type Params = Parameters<WriteFn>;

export type UnwrapParams = {
  signer: Params[0];
  encryptedErc20: Params[1];
  from: Params[2];
  to: Params[3];
  encryptedAmount: Params[4];
  inputProof: Params[5];
};

export function useUnwrap() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, UnwrapParams>({
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
