"use client";

import { wrapContract } from "@zama-fhe/sdk";
import { useWriteContract } from "wagmi";

type WrapParameters = Parameters<typeof wrapContract>;

export function useShield() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function shield(
    wrapperAddress: WrapParameters[0],
    to: WrapParameters[1],
    amount: WrapParameters[2],
  ) {
    return mutate(wrapContract(wrapperAddress, to, amount));
  }

  async function shieldAsync(
    wrapperAddress: WrapParameters[0],
    to: WrapParameters[1],
    amount: WrapParameters[2],
  ) {
    return mutateAsync(wrapContract(wrapperAddress, to, amount));
  }

  return {
    mutate: shield,
    mutateAsync: shieldAsync,
    ...mutation,
  };
}
