import { TRANSFER_BATCHER_ABI } from "../abi/transfer-batch.abi";
import type { Address } from "../relayer/relayer-sdk.types";
import { assertAddress } from "../utils";

/** Batch transfer data for confidentialBatchTransfer. */
export interface BatchTransferData {
  to: Address;
  encryptedAmount: Address;
  inputProof: Address;
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
  batcherAddress: Address,
  tokenAddress: Address,
  fromAddress: Address,
  batchTransferData: BatchTransferData[],
  fees: bigint,
) {
  assertAddress(batcherAddress, "batcherAddress");
  assertAddress(tokenAddress, "tokenAddress");
  assertAddress(fromAddress, "fromAddress");
  return {
    address: batcherAddress,
    abi: TRANSFER_BATCHER_ABI,
    functionName: "confidentialBatchTransfer",
    args: [tokenAddress, fromAddress, batchTransferData],
    value: fees,
  } as const;
}
