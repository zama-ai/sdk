"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Signer } from "ethers";
import { writeUnwrapFromBalanceContract } from "@zama-fhe/sdk/ethers";

export interface UnwrapFromBalanceParams {
  signer: Signer;
  encryptedErc20: Address;
  from: Address;
  to: Address;
  encryptedBalance: Address;
}
export function useUnwrapFromBalance() {
  return useMutation<
    Awaited<ReturnType<typeof writeUnwrapFromBalanceContract>>,
    Error,
    UnwrapFromBalanceParams
  >({
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
