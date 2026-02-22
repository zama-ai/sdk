"use client";

import { useMutation } from "@tanstack/react-query";
import { writeSetOperatorContract } from "@zama-fhe/token-sdk/ethers";

type WriteFn = typeof writeSetOperatorContract;
type Params = Parameters<WriteFn>;

export interface SetOperatorParams {
  signer: Params[0];
  tokenAddress: Params[1];
  spender: Params[2];
  timestamp?: Params[3];
}
export function useSetOperator() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, SetOperatorParams>({
    mutationFn: (params) =>
      writeSetOperatorContract(
        params.signer,
        params.tokenAddress,
        params.spender,
        params.timestamp,
      ),
  });
}
