import { TRANSFER_BATCHER_ABI } from "../abi/transfer-batch.abi";
import type { Hex } from "../relayer/relayer-sdk.types";

/** Batch transfer data for confidentialBatchTransfer. */
export interface BatchTransferData {
  to: Hex;
  encryptedAmount: Hex;
  inputProof: Hex;
  retryFor: bigint;
}

/**
 * Returns the contract config for a confidential batch transfer.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialBatchTransferContract(batcherAddress, tokenAddress, fromAddress, data, fees),
 * );
 * ```
 */
export function confidentialBatchTransferContract(
  batcherAddress: Hex,
  tokenAddress: Hex,
  fromAddress: Hex,
  batchTransferData: BatchTransferData[],
  fees: bigint,
) {
  return {
    address: batcherAddress,
    abi: TRANSFER_BATCHER_ABI,
    functionName: "confidentialBatchTransfer",
    args: [tokenAddress, fromAddress, batchTransferData],
    value: fees,
  } as const;
}
