"use client";

import { wrapContract } from "@zama-fhe/sdk";
import { useWriteContract } from "wagmi";

type WrapParameters = Parameters<typeof wrapContract>;

export function useWrap() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function wrap(
    wrapperAddress: WrapParameters[0],
    to: WrapParameters[1],
    amount: WrapParameters[2],
  ) {
    return mutate(wrapContract(wrapperAddress, to, amount));
  }

  async function wrapAsync(
    wrapperAddress: WrapParameters[0],
    to: WrapParameters[1],
    amount: WrapParameters[2],
  ) {
    return mutateAsync(wrapContract(wrapperAddress, to, amount));
  }

  return {
    mutate: wrap,
    mutateAsync: wrapAsync,
    ...mutation,
  };
}
