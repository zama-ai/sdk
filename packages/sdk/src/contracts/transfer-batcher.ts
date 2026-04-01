import type { Address, Hex } from "viem";
import { transferBatcherAbi } from "../abi/transfer-batch.abi";
import type { Handle } from "../relayer/relayer-sdk.types";

/** Batch transfer data for confidentialBatchTransfer. */
export interface BatchTransferData {
  to: Address;
  encryptedAmount: Handle;
  inputProof: Hex;
  retryFor: bigint;
}

/**
 * Returns the contract config for a confidential batch transfer.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialBatchTransferContract(batcherAddress, tokenAddress, fromAddress, data),
 * );
 * ```
 */
export function confidentialBatchTransferContract(
  batcherAddress: Address,
  tokenAddress: Address,
  fromAddress: Address,
  batchTransferData: BatchTransferData[],
) {
  return {
    address: batcherAddress,
    abi: transferBatcherAbi,
    functionName: "confidentialBatchTransfer",
    args: [tokenAddress, fromAddress, batchTransferData],
  } as const;
}
