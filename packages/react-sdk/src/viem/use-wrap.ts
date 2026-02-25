"use client";

import { useMutation } from "@tanstack/react-query";
import { writeWrapContract } from "@zama-fhe/sdk/viem";

type WriteFn = typeof writeWrapContract;
type Params = Parameters<WriteFn>;

export interface ShieldParams {
  client: Params[0];
  wrapperAddress: Params[1];
  to: Params[2];
  amount: Params[3];
}
export function useShield() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, ShieldParams>({
    mutationFn: (params) =>
      writeWrapContract(params.client, params.wrapperAddress, params.to, params.amount),
  });
}
