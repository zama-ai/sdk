"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Signer } from "ethers";
import { writeWrapETHContract } from "@zama-fhe/sdk/ethers";

export interface ShieldETHParams {
  signer: Signer;
  wrapperAddress: Address;
  to: Address;
  amount: bigint;
  value: bigint;
}
export function useShieldETH() {
  return useMutation<Awaited<ReturnType<typeof writeWrapETHContract>>, Error, ShieldETHParams>({
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
