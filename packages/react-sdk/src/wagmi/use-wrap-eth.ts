"use client";

import { wrapETHContract } from "@zama-fhe/sdk";
import { useWriteContract } from "wagmi";

type WrapETHParameters = Parameters<typeof wrapETHContract>;

export function useWrapETH() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function wrapETH(
    wrapperAddress: WrapETHParameters[0],
    to: WrapETHParameters[1],
    amount: WrapETHParameters[2],
    value: WrapETHParameters[3],
  ) {
    return mutate(wrapETHContract(wrapperAddress, to, amount, value));
  }

  async function wrapETHAsync(
    wrapperAddress: WrapETHParameters[0],
    to: WrapETHParameters[1],
    amount: WrapETHParameters[2],
    value: WrapETHParameters[3],
  ) {
    return mutateAsync(wrapETHContract(wrapperAddress, to, amount, value));
  }

  return {
    mutate: wrapETH,
    mutateAsync: wrapETHAsync,
    ...mutation,
  };
}
