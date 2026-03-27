import { erc20Abi, type Address } from "viem";

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
    abi: erc20Abi,
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
    abi: erc20Abi,
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
    abi: erc20Abi,
    functionName: "decimals",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read an ERC-20 token's total supply.
 *
 * @example
 * ```ts
 * const supply = await signer.readContract(erc20TotalSupplyContract(tokenAddress));
 * ```
 */
export function erc20TotalSupplyContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "totalSupply",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read an ERC-20 balance.
 *
 * @example
 * ```ts
 * const balance = await signer.readContract(
 *   balanceOfContract(tokenAddress, account),
 * );
 * ```
 */
export function balanceOfContract(tokenAddress: Address, account: Address) {
  return {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
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
    abi: erc20Abi,
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
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, value],
  } as const;
}
