import { TRANSFER_BATCHER_ABI } from "../abi/transfer-batch.abi";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { Address, Hex } from "viem";
import { FHE_GAS_LIMIT } from "./gas";

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
  return {
    address: batcherAddress,
    abi: TRANSFER_BATCHER_ABI,
    functionName: "confidentialBatchTransfer",
    args: [tokenAddress, fromAddress, batchTransferData],
    value: fees,
    gas: FHE_GAS_LIMIT,
  } as const;
}
