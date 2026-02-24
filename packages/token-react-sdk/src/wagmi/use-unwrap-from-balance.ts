"use client";

import { unwrapFromBalanceContract } from "@zama-fhe/sdk";
import { useWriteContract } from "wagmi";

type UnwrapFromBalanceParameters = Parameters<typeof unwrapFromBalanceContract>;

export function useUnwrapFromBalance() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function unwrapFromBalance(
    encryptedErc20: UnwrapFromBalanceParameters[0],
    from: UnwrapFromBalanceParameters[1],
    to: UnwrapFromBalanceParameters[2],
    encryptedBalance: UnwrapFromBalanceParameters[3],
  ) {
    return mutate(unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance));
  }

  async function unwrapFromBalanceAsync(
    encryptedErc20: UnwrapFromBalanceParameters[0],
    from: UnwrapFromBalanceParameters[1],
    to: UnwrapFromBalanceParameters[2],
    encryptedBalance: UnwrapFromBalanceParameters[3],
  ) {
    return mutateAsync(unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance));
  }

  return {
    mutate: unwrapFromBalance,
    mutateAsync: unwrapFromBalanceAsync,
    ...mutation,
  };
}
