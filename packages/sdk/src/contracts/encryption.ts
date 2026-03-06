import { toHex } from "viem";
import { ENCRYPTION_ABI } from "../abi/encryption.abi";
import type { Address, Handle } from "../relayer/relayer-sdk.types";
import { assertAddress } from "../utils";
import { FHE_GAS_LIMIT } from "./gas";

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
  assertAddress(tokenAddress, "tokenAddress");
  assertAddress(userAddress, "userAddress");
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
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
  assertAddress(encryptedErc20, "encryptedErc20");
  assertAddress(to, "to");
  return {
    address: encryptedErc20,
    abi: ENCRYPTION_ABI,
    functionName: "confidentialTransfer",
    args: [to, toHex(handle), toHex(inputProof)],
    gas: FHE_GAS_LIMIT,
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
  assertAddress(encryptedErc20, "encryptedErc20");
  assertAddress(from, "from");
  assertAddress(to, "to");
  return {
    address: encryptedErc20,
    abi: ENCRYPTION_ABI,
    functionName: "confidentialTransferFrom",
    args: [from, to, toHex(handle), toHex(inputProof)],
    gas: FHE_GAS_LIMIT,
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
  assertAddress(tokenAddress, "tokenAddress");
  assertAddress(holder, "holder");
  assertAddress(spender, "spender");
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
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
  assertAddress(tokenAddress, "tokenAddress");
  assertAddress(spender, "spender");
  const until = timestamp ?? Math.floor(Date.now() / 1000) + 3600;
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
    functionName: "setOperator",
    args: [spender, until],
    gas: FHE_GAS_LIMIT,
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
  assertAddress(encryptedErc20, "encryptedErc20");
  assertAddress(from, "from");
  assertAddress(to, "to");
  return {
    address: encryptedErc20,
    abi: ENCRYPTION_ABI,
    functionName: "unwrap",
    args: [from, to, toHex(encryptedAmount), toHex(inputProof)],
    gas: FHE_GAS_LIMIT,
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
  assertAddress(encryptedErc20, "encryptedErc20");
  assertAddress(from, "from");
  assertAddress(to, "to");
  return {
    address: encryptedErc20,
    abi: ENCRYPTION_ABI,
    functionName: "unwrap",
    args: [from, to, encryptedBalance],
    gas: FHE_GAS_LIMIT,
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
  assertAddress(tokenAddress, "tokenAddress");
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
    functionName: "confidentialTotalSupply",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the plaintext total supply.
 *
 * @example
 * ```ts
 * const supply = await signer.readContract(
 *   totalSupplyContract(tokenAddress),
 * );
 * ```
 */
export function totalSupplyContract(tokenAddress: Address) {
  assertAddress(tokenAddress, "tokenAddress");
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
    functionName: "totalSupply",
    args: [],
  } as const;
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
  assertAddress(tokenAddress, "tokenAddress");
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
    functionName: "rate",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the deployment coordinator address.
 *
 * @example
 * ```ts
 * const coordinator = await signer.readContract(
 *   deploymentCoordinatorContract(tokenAddress),
 * );
 * ```
 */
export function deploymentCoordinatorContract(tokenAddress: Address) {
  assertAddress(tokenAddress, "tokenAddress");
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
    functionName: "deploymentCoordinator",
    args: [],
  } as const;
}

/**
 * Returns the contract config to check finalizeUnwrap operator status.
 *
 * @example
 * ```ts
 * const isOp = await signer.readContract(
 *   isFinalizeUnwrapOperatorContract(tokenAddress, holder, operator),
 * );
 * ```
 */
export function isFinalizeUnwrapOperatorContract(
  tokenAddress: Address,
  holder: Address,
  operator: Address,
) {
  assertAddress(tokenAddress, "tokenAddress");
  assertAddress(holder, "holder");
  assertAddress(operator, "operator");
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
    functionName: "isFinalizeUnwrapOperator",
    args: [holder, operator],
  } as const;
}

/**
 * Returns the contract config for setting a finalizeUnwrap operator.
 * Defaults timestamp to 1 hour from now.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   setFinalizeUnwrapOperatorContract(tokenAddress, operator),
 * );
 * ```
 */
export function setFinalizeUnwrapOperatorContract(
  tokenAddress: Address,
  operator: Address,
  timestamp?: number,
) {
  assertAddress(tokenAddress, "tokenAddress");
  assertAddress(operator, "operator");
  const until = timestamp ?? Math.floor(Date.now() / 1000) + 3600;
  return {
    address: tokenAddress,
    abi: ENCRYPTION_ABI,
    functionName: "setFinalizeUnwrapOperator",
    args: [operator, until],
    gas: FHE_GAS_LIMIT,
  } as const;
}
