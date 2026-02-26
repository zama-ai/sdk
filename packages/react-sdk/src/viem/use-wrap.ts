"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { WalletClient } from "viem";
import { writeWrapContract } from "@zama-fhe/sdk/viem";

export interface ShieldParams {
  client: WalletClient;
  wrapperAddress: Address;
  to: Address;
  amount: bigint;
}
export function useShield() {
  return useMutation<Awaited<ReturnType<typeof writeWrapContract>>, Error, ShieldParams>({
    mutationFn: (params) =>
      writeWrapContract(params.client, params.wrapperAddress, params.to, params.amount),
  });
}
