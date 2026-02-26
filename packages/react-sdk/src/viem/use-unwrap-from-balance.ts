"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { WalletClient } from "viem";
import { writeUnwrapFromBalanceContract } from "@zama-fhe/sdk/viem";

export interface UnwrapFromBalanceParams {
  client: WalletClient;
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
        params.client,
        params.encryptedErc20,
        params.from,
        params.to,
        params.encryptedBalance,
      ),
  });
}
