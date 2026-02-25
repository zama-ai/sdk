"use client";

import { useMutation } from "@tanstack/react-query";
import { writeWrapETHContract } from "@zama-fhe/sdk/ethers";

type WriteFn = typeof writeWrapETHContract;
type Params = Parameters<WriteFn>;

export interface ShieldETHParams {
  signer: Params[0];
  wrapperAddress: Params[1];
  to: Params[2];
  amount: Params[3];
  value: Params[4];
}
export function useShieldETH() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, ShieldETHParams>({
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
