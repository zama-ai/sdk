import { ERC20_ABI, ERC20_METADATA_ABI } from "../abi/erc20.abi";
import type { Address } from "../relayer/relayer-sdk.types";

/**
 * Returns the contract config to read a token's name.
 *
 * @example
 * ```ts
 * const name = await signer.readContract(nameContract(tokenAddress));
 * ```
 */
export function nameContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: ERC20_METADATA_ABI,
    functionName: "name",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read a token's symbol.
 *
 * @example
 * ```ts
 * const symbol = await signer.readContract(symbolContract(tokenAddress));
 * ```
 */
export function symbolContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: ERC20_METADATA_ABI,
    functionName: "symbol",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read a token's decimals.
 *
 * @example
 * ```ts
 * const decimals = await signer.readContract(decimalsContract(tokenAddress));
 * ```
 */
export function decimalsContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: ERC20_METADATA_ABI,
    functionName: "decimals",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read an ERC-20 allowance.
 *
 * @example
 * ```ts
 * const allowance = await signer.readContract(
 *   allowanceContract(tokenAddress, owner, spender),
 * );
 * ```
 */
export function allowanceContract(tokenAddress: Address, owner: Address, spender: Address) {
  return {
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  } as const;
}

/**
 * Returns the contract config for an ERC-20 approve.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   approveContract(tokenAddress, spender, amount),
 * );
 * ```
 */
export function approveContract(tokenAddress: Address, spender: Address, value: bigint) {
  return {
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, value],
  } as const;
}
