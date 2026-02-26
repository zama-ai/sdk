"use client";

import { wrapETHContract } from "@zama-fhe/sdk";
import { useWriteContract } from "wagmi";

type WrapETHParameters = Parameters<typeof wrapETHContract>;

export function useShieldETH() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function shieldETH(
    wrapperAddress: WrapETHParameters[0],
    to: WrapETHParameters[1],
    amount: WrapETHParameters[2],
    value: WrapETHParameters[3],
  ) {
    return mutate(wrapETHContract(wrapperAddress, to, amount, value));
  }

  async function shieldETHAsync(
    wrapperAddress: WrapETHParameters[0],
    to: WrapETHParameters[1],
    amount: WrapETHParameters[2],
    value: WrapETHParameters[3],
  ) {
    return mutateAsync(wrapETHContract(wrapperAddress, to, amount, value));
  }

  return {
    mutate: shieldETH,
    mutateAsync: shieldETHAsync,
    ...mutation,
  };
}
