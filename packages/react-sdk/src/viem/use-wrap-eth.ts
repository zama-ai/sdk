"use client";

import { useMutation } from "@tanstack/react-query";
import { writeWrapETHContract } from "@zama-fhe/sdk/viem";

type WriteFn = typeof writeWrapETHContract;
type Params = Parameters<WriteFn>;

export interface ShieldETHParams {
  client: Params[0];
  wrapperAddress: Params[1];
  to: Params[2];
  amount: Params[3];
  value: Params[4];
}
export function useShieldETH() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, ShieldETHParams>({
    mutationFn: (params) =>
      writeWrapETHContract(
        params.client,
        params.wrapperAddress,
        params.to,
        params.amount,
        params.value,
      ),
  });
}
