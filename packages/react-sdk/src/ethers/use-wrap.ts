"use client";

import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { Signer } from "ethers";
import { writeWrapContract } from "@zama-fhe/sdk/ethers";

export interface ShieldParams {
  signer: Signer;
  wrapperAddress: Address;
  to: Address;
  amount: bigint;
}
export function useShield() {
  return useMutation<Awaited<ReturnType<typeof writeWrapContract>>, Error, ShieldParams>({
    mutationFn: (params) =>
      writeWrapContract(params.signer, params.wrapperAddress, params.to, params.amount),
  });
}
