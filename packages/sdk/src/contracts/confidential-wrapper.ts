import type { Address, Hex } from "viem";
import { confidentialWrapperAbi } from "../abi/confidential-wrapper.abi";
import type { EncryptedValue } from "../relayer/types";

/**
 * Returns the contract config to read an encrypted balance.
 *
 * @example
 * ```ts
 * const handle = await provider.readContract(
 *   confidentialBalanceOfContract(tokenAddress, userAddress),
 * );
 * ```
 */
export function confidentialBalanceOfContract(tokenAddress: Address, userAddress: Address) {
  return {
    address: tokenAddress,
    abi: confidentialWrapperAbi,
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
 *   confidentialTransferContract(tokenAddress, to, encryptedValues[0], inputProof),
 * );
 * ```
 */
export function confidentialTransferContract(
  encryptedErc20: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
) {
  return {
    address: encryptedErc20,
    abi: confidentialWrapperAbi,
    functionName: "confidentialTransfer",
    args: [to, encryptedAmount, inputProof],
  } as const;
}

/**
 * Returns the contract config for a confidential transferFrom.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialTransferFromContract(tokenAddress, from, to, encryptedValues[0], inputProof),
 * );
 * ```
 */
export function confidentialTransferFromContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
) {
  return {
    address: encryptedErc20,
    abi: confidentialWrapperAbi,
    functionName: "confidentialTransferFrom",
    args: [from, to, encryptedAmount, inputProof],
  } as const;
}

/**
 * Returns the contract config for a confidential transferAndCall. The caller
 * supplies an opaque `data` payload that is forwarded to the recipient's
 * ERC-7984 receiver hook (`onConfidentialTransferReceived`). The SDK does not
 * craft, validate, or inspect `data` — encoding the call site's domain message
 * is the caller's responsibility.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialTransferAndCallContract(
 *     tokenAddress,
 *     to,
 *     encryptedValues[0],
 *     inputProof,
 *     data,
 *   ),
 * );
 * ```
 */
export function confidentialTransferAndCallContract(
  encryptedErc20: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
  data: Hex,
) {
  return {
    address: encryptedErc20,
    abi: confidentialWrapperAbi,
    functionName: "confidentialTransferAndCall",
    args: [to, encryptedAmount, inputProof, data],
  } as const;
}

/**
 * Returns the contract config for a confidential transferFromAndCall. The
 * caller supplies an opaque `data` payload forwarded to the recipient's
 * ERC-7984 receiver hook; the SDK does not craft or inspect it.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   confidentialTransferFromAndCallContract(
 *     tokenAddress,
 *     from,
 *     to,
 *     encryptedValues[0],
 *     inputProof,
 *     data,
 *   ),
 * );
 * ```
 */
export function confidentialTransferFromAndCallContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
  data: Hex,
) {
  return {
    address: encryptedErc20,
    abi: confidentialWrapperAbi,
    functionName: "confidentialTransferFromAndCall",
    args: [from, to, encryptedAmount, inputProof, data],
  } as const;
}

/**
 * Returns the contract config for checking operator status.
 *
 * @example
 * ```ts
 * const isOperator = await provider.readContract(
 *   isOperatorContract(tokenAddress, holder, spender),
 * );
 * ```
 */
export function isOperatorContract(tokenAddress: Address, holder: Address, spender: Address) {
  return {
    address: tokenAddress,
    abi: confidentialWrapperAbi,
    functionName: "isOperator",
    args: [holder, spender],
  } as const;
}

/**
 * Returns the contract config for setting an operator.
 * Defaults until to 1 hour from now.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   setOperatorContract(tokenAddress, operator),
 * );
 * ```
 */
export function setOperatorContract(tokenAddress: Address, operator: Address, until?: number) {
  const effectiveUntil = until ?? Math.floor(Date.now() / 1000) + 3600;
  return {
    address: tokenAddress,
    abi: confidentialWrapperAbi,
    functionName: "setOperator",
    args: [operator, effectiveUntil],
  } as const;
}

/**
 * Returns the contract config for an unwrap with newly encrypted amount.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   unwrapContract(encryptedErc20, from, to, encryptedValues[0], inputProof),
 * );
 * ```
 */
export function unwrapContract(
  encryptedErc20: Address,
  from: Address,
  to: Address,
  encryptedAmount: EncryptedValue,
  inputProof: Hex,
) {
  return {
    address: encryptedErc20,
    abi: confidentialWrapperAbi,
    functionName: "unwrap",
    args: [from, to, encryptedAmount, inputProof],
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
  encryptedBalance: EncryptedValue,
) {
  return {
    address: encryptedErc20,
    abi: confidentialWrapperAbi,
    functionName: "unwrap",
    args: [from, to, encryptedBalance],
  } as const;
}

/**
 * Returns the contract config to read the confidential (encrypted) total supply.
 *
 * @example
 * ```ts
 * const handle = await provider.readContract(
 *   confidentialTotalSupplyContract(tokenAddress),
 * );
 * ```
 */
export function confidentialTotalSupplyContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: confidentialWrapperAbi,
    functionName: "confidentialTotalSupply",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the wrap/unwrap conversion rate.
 *
 * @example
 * ```ts
 * const rate = await provider.readContract(rateContract(tokenAddress));
 * ```
 */
export function rateContract(tokenAddress: Address) {
  return {
    address: tokenAddress,
    abi: confidentialWrapperAbi,
    functionName: "rate",
    args: [],
  } as const;
}

/**
 * Returns the contract config for finalizing an unwrap.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   finalizeUnwrapContract(wrapper, unwrapRequestId, cleartext, proof),
 * );
 * ```
 */
export function finalizeUnwrapContract(
  wrapper: Address,
  unwrapRequestId: EncryptedValue,
  unwrapAmountCleartext: bigint,
  decryptionProof: Hex,
) {
  return {
    address: wrapper,
    abi: confidentialWrapperAbi,
    functionName: "finalizeUnwrap",
    args: [unwrapRequestId, unwrapAmountCleartext, decryptionProof],
  } as const;
}

/**
 * Returns the contract config to read the underlying ERC-20 token of a wrapper.
 *
 * @example
 * ```ts
 * const token = await provider.readContract(underlyingContract(wrapperAddress));
 * ```
 */
export function underlyingContract(wrapperAddress: Address) {
  return {
    address: wrapperAddress,
    abi: confidentialWrapperAbi,
    functionName: "underlying",
    args: [],
  } as const;
}

/**
 * Returns the contract config to read the inferred plaintext total supply.
 *
 * @example
 * ```ts
 * const supply = await provider.readContract(
 *   inferredTotalSupplyContract(wrapperAddress),
 * );
 * ```
 */
export function inferredTotalSupplyContract(wrapperAddress: Address) {
  return {
    address: wrapperAddress,
    abi: confidentialWrapperAbi,
    functionName: "inferredTotalSupply",
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
    abi: confidentialWrapperAbi,
    functionName: "wrap",
    args: [to, amount],
  } as const;
}
