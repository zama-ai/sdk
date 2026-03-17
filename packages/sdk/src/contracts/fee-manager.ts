import { type Address } from "viem";

export const feeManagerAbi = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "wrapFrom",
        type: "address",
      },
      {
        internalType: "address",
        name: "wrapTo",
        type: "address",
      },
    ],
    name: "getWrapFee",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint64",
        name: "amount",
        type: "uint64",
      },
      {
        internalType: "address",
        name: "unwrapFrom",
        type: "address",
      },
      {
        internalType: "address",
        name: "unwrapTo",
        type: "address",
      },
    ],
    name: "getUnwrapFee",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getBatchTransferFee",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getFeeRecipient",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Returns the contract config to compute the wrap fee.
 *
 * @example
 * ```ts
 * const fee = await signer.readContract(
 *   getWrapFeeContract(feeManager, amount, from, to),
 * );
 * ```
 */
export function getWrapFeeContract(
  feeManagerAddress: Address,
  amount: bigint,
  wrapFrom: Address,
  wrapTo: Address,
) {
  return {
    address: feeManagerAddress,
    abi: feeManagerAbi,
    functionName: "getWrapFee",
    args: [amount, wrapFrom, wrapTo],
  } as const;
}

/**
 * Returns the contract config to compute the unwrap fee.
 *
 * @example
 * ```ts
 * const fee = await signer.readContract(
 *   getUnwrapFeeContract(feeManager, amount, from, to),
 * );
 * ```
 */
export function getUnwrapFeeContract(
  feeManagerAddress: Address,
  amount: bigint,
  unwrapFrom: Address,
  unwrapTo: Address,
) {
  return {
    address: feeManagerAddress,
    abi: feeManagerAbi,
    functionName: "getUnwrapFee",
    args: [amount, unwrapFrom, unwrapTo],
  } as const;
}

/**
 * Returns the contract config to read the batch transfer fee.
 *
 * @example
 * ```ts
 * const fee = await signer.readContract(
 *   getBatchTransferFeeContract(feeManagerAddress),
 * );
 * ```
 */
export function getBatchTransferFeeContract(feeManagerAddress: Address) {
  return {
    address: feeManagerAddress,
    abi: feeManagerAbi,
    functionName: "getBatchTransferFee",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the fee recipient address.
 *
 * @example
 * ```ts
 * const recipient = await signer.readContract(
 *   getFeeRecipientContract(feeManagerAddress),
 * );
 * ```
 */
export function getFeeRecipientContract(feeManagerAddress: Address) {
  return {
    address: feeManagerAddress,
    abi: feeManagerAbi,
    functionName: "getFeeRecipient",
    args: [],
  } as const;
}
