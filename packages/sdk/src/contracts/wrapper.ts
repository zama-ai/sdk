import type { Address, Hex } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";
import { wrapperAbi } from "../abi/wrapper.abi";

/**
 * Returns the contract config for finalizing an unwrap.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   finalizeUnwrapContract(wrapper, burntAmount, cleartext, proof),
 * );
 * ```
 */
export function finalizeUnwrapContract(
  wrapper: Address,
  burntAmount: Handle,
  burntAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return {
    address: wrapper,
    abi: wrapperAbi,
    functionName: "finalizeUnwrap",
    args: [burntAmount, burntAmountCleartext, decryptionProof],
  } as const;
}

/**
 * Returns the contract config to read the underlying ERC-20 token of a wrapper.
 *
 * @example
 * ```ts
 * const token = await signer.readContract(underlyingContract(wrapperAddress));
 * ```
 */
export function underlyingContract(wrapperAddress: Address) {
  return {
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "underlying",
    args: [],
  } as const;
}

/**
 * Returns the contract config for a wrap (shield) operation.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   wrapContract(wrapperAddress, to, amount),
 * );
 * ```
 */
export function wrapContract(wrapperAddress: Address, to: Address, amount: bigint) {
  return {
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "wrap",
    args: [to, amount],
  } as const;
}

/**
 * Returns the contract config for wrapping native ETH into a confidential wrapper.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   wrapETHContract(wrapperAddress, to, amount, value),
 * );
 * ```
 */
export function wrapETHContract(
  wrapperAddress: Address,
  to: Address,
  amount: bigint,
  value: bigint,
) {
  return {
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "wrapETH",
    args: [to, amount],
    value,
  } as const;
}
