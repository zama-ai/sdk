"use client";

import { unwrapContract } from "@zama-fhe/token-sdk";
import { useWriteContract } from "wagmi";

type UnwrapParameters = Parameters<typeof unwrapContract>;

export function useUnwrap() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function unwrap(
    encryptedErc20: UnwrapParameters[0],
    from: UnwrapParameters[1],
    to: UnwrapParameters[2],
    encryptedAmount: UnwrapParameters[3],
    inputProof: UnwrapParameters[4],
  ) {
    return mutate(
      unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof),
    );
  }

  async function unwrapAsync(
    encryptedErc20: UnwrapParameters[0],
    from: UnwrapParameters[1],
    to: UnwrapParameters[2],
    encryptedAmount: UnwrapParameters[3],
    inputProof: UnwrapParameters[4],
  ) {
    return mutateAsync(
      unwrapContract(encryptedErc20, from, to, encryptedAmount, inputProof),
    );
  }

  return {
    mutate: unwrap,
    mutateAsync: unwrapAsync,
    ...mutation,
  };
}
