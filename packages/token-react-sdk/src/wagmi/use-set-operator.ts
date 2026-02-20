"use client";

import { setOperatorContract } from "@zama-fhe/token-sdk";
import { useWriteContract } from "wagmi";

type SetOperatorParameters = Parameters<typeof setOperatorContract>;

export function useSetOperator() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function setOperator(
    tokenAddress: SetOperatorParameters[0],
    spender: SetOperatorParameters[1],
    timestamp?: SetOperatorParameters[2],
  ) {
    return mutate(setOperatorContract(tokenAddress, spender, timestamp));
  }

  async function setOperatorAsync(
    tokenAddress: SetOperatorParameters[0],
    spender: SetOperatorParameters[1],
    timestamp?: SetOperatorParameters[2],
  ) {
    return mutateAsync(setOperatorContract(tokenAddress, spender, timestamp));
  }

  return {
    mutate: setOperator,
    mutateAsync: setOperatorAsync,
    ...mutation,
  };
}
