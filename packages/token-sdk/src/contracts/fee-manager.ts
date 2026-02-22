import { FEE_MANAGER_ABI } from "../abi/fee-manager.abi";
import type { Hex } from "../relayer/relayer-sdk.types";

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
  feeManagerAddress: Hex,
  amount: bigint,
  wrapFrom: Hex,
  wrapTo: Hex,
) {
  return {
    address: feeManagerAddress,
    abi: FEE_MANAGER_ABI,
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
  feeManagerAddress: Hex,
  amount: bigint,
  unwrapFrom: Hex,
  unwrapTo: Hex,
) {
  return {
    address: feeManagerAddress,
    abi: FEE_MANAGER_ABI,
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
export function getBatchTransferFeeContract(feeManagerAddress: Hex) {
  return {
    address: feeManagerAddress,
    abi: FEE_MANAGER_ABI,
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
export function getFeeRecipientContract(feeManagerAddress: Hex) {
  return {
    address: feeManagerAddress,
    abi: FEE_MANAGER_ABI,
    functionName: "getFeeRecipient",
    args: [],
  } as const;
}
