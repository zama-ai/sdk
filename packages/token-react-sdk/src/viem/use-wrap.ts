"use client";

import { useMutation } from "@tanstack/react-query";
import { writeWrapContract } from "@zama-fhe/token-sdk/viem";

type WriteFn = typeof writeWrapContract;
type Params = Parameters<WriteFn>;

export type WrapParams = {
  client: Params[0];
  wrapperAddress: Params[1];
  to: Params[2];
  amount: Params[3];
};

export function useWrap() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, WrapParams>({
    mutationFn: (params) =>
      writeWrapContract(
        params.client,
        params.wrapperAddress,
        params.to,
        params.amount,
      ),
  });
}
