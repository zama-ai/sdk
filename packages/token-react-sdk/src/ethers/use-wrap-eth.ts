"use client";

import { useMutation } from "@tanstack/react-query";
import { writeWrapETHContract } from "@zama-fhe/token-sdk/ethers";

type WriteFn = typeof writeWrapETHContract;
type Params = Parameters<WriteFn>;

export interface WrapETHParams {
  signer: Params[0];
  wrapperAddress: Params[1];
  to: Params[2];
  amount: Params[3];
  value: Params[4];
}
export function useWrapETH() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, WrapETHParams>({
    mutationFn: (params) =>
      writeWrapETHContract(
        params.signer,
        params.wrapperAddress,
        params.to,
        params.amount,
        params.value,
      ),
  });
}
