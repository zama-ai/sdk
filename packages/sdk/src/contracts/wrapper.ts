import { WRAPPER_ABI } from "../abi/wrapper.abi";
import type { Address, Handle, Hex } from "../relayer/relayer-sdk.types";
import { assertAddress } from "../utils";
import { FHE_GAS_LIMIT } from "./gas";

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
  assertAddress(wrapper, "wrapper");
  return {
    address: wrapper,
    abi: WRAPPER_ABI,
    functionName: "finalizeUnwrap",
    args: [burntAmount, burntAmountCleartext, decryptionProof],
    gas: FHE_GAS_LIMIT,
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
  assertAddress(wrapperAddress, "wrapperAddress");
  return {
    address: wrapperAddress,
    abi: WRAPPER_ABI,
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
  assertAddress(wrapperAddress, "wrapperAddress");
  assertAddress(to, "to");
  return {
    address: wrapperAddress,
    abi: WRAPPER_ABI,
    functionName: "wrap",
    args: [to, amount],
    gas: FHE_GAS_LIMIT,
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
  assertAddress(wrapperAddress, "wrapperAddress");
  assertAddress(to, "to");
  return {
    address: wrapperAddress,
    abi: WRAPPER_ABI,
    functionName: "wrapETH",
    args: [to, amount],
    value,
    gas: FHE_GAS_LIMIT,
  } as const;
}
