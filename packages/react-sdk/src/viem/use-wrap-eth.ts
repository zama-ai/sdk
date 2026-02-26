"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { WalletClient } from "viem";
import { writeWrapETHContract } from "@zama-fhe/sdk/viem";

export interface ShieldETHParams {
  client: WalletClient;
  wrapperAddress: Address;
  to: Address;
  amount: bigint;
  value: bigint;
}
export function useShieldETH() {
  return useMutation<Awaited<ReturnType<typeof writeWrapETHContract>>, Error, ShieldETHParams>({
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
