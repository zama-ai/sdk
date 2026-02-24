"use client";

import { useMutation } from "@tanstack/react-query";
import { writeUnwrapFromBalanceContract } from "@zama-fhe/sdk/ethers";

type WriteFn = typeof writeUnwrapFromBalanceContract;
type Params = Parameters<WriteFn>;

export interface UnwrapFromBalanceParams {
  signer: Params[0];
  encryptedErc20: Params[1];
  from: Params[2];
  to: Params[3];
  encryptedBalance: Params[4];
}
export function useUnwrapFromBalance() {
  return useMutation<Awaited<ReturnType<WriteFn>>, Error, UnwrapFromBalanceParams>({
    mutationFn: (params) =>
      writeUnwrapFromBalanceContract(
        params.signer,
        params.encryptedErc20,
        params.from,
        params.to,
        params.encryptedBalance,
      ),
  });
}
