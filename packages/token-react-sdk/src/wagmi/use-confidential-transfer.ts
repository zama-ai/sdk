"use client";

import { confidentialTransferContract } from "@zama-fhe/token-sdk";
import { useWriteContract } from "wagmi";

type EncryptedTransferParameters = Parameters<
  typeof confidentialTransferContract
>;

export function useConfidentialTransfer() {
  const { mutate, mutateAsync, ...mutation } = useWriteContract();

  function transfer(
    encryptedErc20: EncryptedTransferParameters[0],
    to: EncryptedTransferParameters[1],
    handle: EncryptedTransferParameters[2],
    inputProof: EncryptedTransferParameters[3],
  ) {
    return mutate(
      confidentialTransferContract(encryptedErc20, to, handle, inputProof),
    );
  }

  async function transferAsync(
    encryptedErc20: EncryptedTransferParameters[0],
    to: EncryptedTransferParameters[1],
    handle: EncryptedTransferParameters[2],
    inputProof: EncryptedTransferParameters[3],
  ) {
    return mutateAsync(
      confidentialTransferContract(encryptedErc20, to, handle, inputProof),
    );
  }

  return {
    mutate: transfer,
    mutateAsync: transferAsync,
    ...mutation,
  };
}
