import type { Address } from "viem";
import { feeManagerAbi } from "../abi/fee-manager.abi";

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
