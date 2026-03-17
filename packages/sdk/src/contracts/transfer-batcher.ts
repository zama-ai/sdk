import type { Handle } from "../relayer/relayer-sdk.types";
import type { Address, Hex } from "viem";

export const transferBatcherAbi = [
  {
    inputs: [
      {
        internalType: "contract RegulatedERC7984Upgradeable",
        name: "cToken",
        type: "address",
      },
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        components: [
          {
            internalType: "address",
            name: "to",
            type: "address",
          },
          {
            internalType: "externalEuint64",
            name: "encryptedAmount",
            type: "bytes32",
          },
          {
            internalType: "bytes",
            name: "inputProof",
            type: "bytes",
          },
          {
            internalType: "uint256",
            name: "retryFor",
            type: "uint256",
          },
        ],
        internalType: "struct ERC7984TransferBatcher.ConfidentialTransferInput[]",
        name: "transfers",
        type: "tuple[]",
      },
    ],
    name: "confidentialBatchTransfer",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

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
    abi: transferBatcherAbi,
    functionName: "confidentialBatchTransfer",
    args: [tokenAddress, fromAddress, batchTransferData],
    value: fees,
  } as const;
}
