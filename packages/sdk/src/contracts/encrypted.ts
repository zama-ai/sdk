import type { Address } from "viem";
import { toHex } from "viem";
import { encryptedAbi } from "../abi/encrypted.abi";
import type { Handle } from "../relayer/relayer-sdk.types";
import { inferredTotalSupplyContract } from "./wrapper";

/**
 * Returns the contract config to read an encrypted balance.
 *
 * @example
 * ```ts
 * const handle = await signer.readContract(
 *   confidentialBalanceOfContract(tokenAddress, userAddress),
 * );
 * ```
 */
export function confidentialBalanceOfContract(tokenAddress: Address, userAddress: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "confidentialBalanceOf",
    args: [userAddress],
  } as const;
}

/**
 * Returns the contract config for a confidential transfer.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialTransferContract(tokenAddress, to, handles[0], inputProof),
 * );
 * ```
 */
export function confidentialTransferContract(
  encryptedErc20: Address,
  to: Address,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return {
    address: encryptedErc20,
    abi: encryptedAbi,
    functionName: "confidentialTransfer",
    args: [to, toHex(handle), toHex(inputProof)],
  } as const;
}

/**
 * Returns the contract config for a confidential transferFrom.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialTransferFromContract(tokenAddress, from, to, handles[0], inputProof),
 * );
 * ```
 */
export function confidentialTransferFromContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  handle: Uint8Array,
  inputProof: Uint8Array,
) {
  return {
    address: encryptedErc20,
    abi: encryptedAbi,
    functionName: "confidentialTransferFrom",
    args: [from, to, toHex(handle), toHex(inputProof)],
  } as const;
}

/**
 * Returns the contract config for checking operator status.
 *
 * @example
 * ```ts
 * const isApproved = await signer.readContract(
 *   isOperatorContract(tokenAddress, holder, spender),
 * );
 * ```
 */
export function isOperatorContract(tokenAddress: Address, holder: Address, spender: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "isOperator",
    args: [holder, spender],
  } as const;
}

/**
 * Returns the contract config for setting an operator.
 * Defaults timestamp to 1 hour from now.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   setOperatorContract(tokenAddress, spender),
 * );
 * ```
 */
export function setOperatorContract(tokenAddress: Address, spender: Address, timestamp?: number) {
  const until = timestamp ?? Math.floor(Date.now() / 1000) + 3600;
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "setOperator",
    args: [spender, until],
  } as const;
}

/**
 * Returns the contract config for an unwrap with newly encrypted amount.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   unwrapContract(encryptedErc20, from, to, handles[0], inputProof),
 * );
 * ```
 */
export function unwrapContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: Uint8Array,
  inputProof: Uint8Array,
) {
  return {
    address: encryptedErc20,
    abi: encryptedAbi,
    functionName: "unwrap",
    args: [from, to, toHex(encryptedAmount), toHex(inputProof)],
  } as const;
}

/**
 * Returns the contract config for an unwrap with an existing balance handle.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   unwrapFromBalanceContract(encryptedErc20, from, to, encryptedBalance),
 * );
 * ```
 */
export function unwrapFromBalanceContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedBalance: Handle,
) {
  return {
    address: encryptedErc20,
    abi: encryptedAbi,
    functionName: "unwrap",
    args: [from, to, encryptedBalance],
  } as const;
}

/**
 * Returns the contract config to read the confidential (encrypted) total supply.
 *
 * @example
 * ```ts
 * const handle = await signer.readContract(
 *   confidentialTotalSupplyContract(tokenAddress),
 * );
 * ```
 */
export function confidentialTotalSupplyContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "confidentialTotalSupply",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the inferred plaintext total supply.
 *
 * @deprecated Use {@link inferredTotalSupplyContract}. `totalSupply()` was
 * renamed to `inferredTotalSupply()` on wrapper contracts.
 *
 * @example
 * ```ts
 * const supply = await signer.readContract(
 *   totalSupplyContract(wrapperAddress),
 * );
 * ```
 */
export function totalSupplyContract(wrapperAddress: Address) {
  return inferredTotalSupplyContract(wrapperAddress);
}

/**
 * Returns the contract config to read the wrap/unwrap conversion rate.
 *
 * @example
 * ```ts
 * const rate = await signer.readContract(rateContract(tokenAddress));
 * ```
 */
export function rateContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: encryptedAbi,
    functionName: "rate",
    args: [],
  } as const;
}
