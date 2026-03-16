import type { Address } from "viem";

export const aclAbi = [
  {
    inputs: [
      { internalType: "address", name: "delegate", type: "address" },
      { internalType: "address", name: "contractAddress", type: "address" },
      { internalType: "uint64", name: "expirationDate", type: "uint64" },
    ],
    name: "delegateForUserDecryption",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "delegate", type: "address" },
      { internalType: "address", name: "contractAddress", type: "address" },
    ],
    name: "revokeDelegationForUserDecryption",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "delegator", type: "address" },
      { internalType: "address", name: "delegate", type: "address" },
      { internalType: "address", name: "contractAddress", type: "address" },
    ],
    name: "getUserDecryptionDelegationExpirationDate",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Returns the contract config to delegate user decryption rights.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   delegateForUserDecryptionContract(aclAddress, delegateAddress, contractAddress, expirationDate),
 * );
 * ```
 */
export function delegateForUserDecryptionContract(
  aclAddress: Address,
  delegateAddress: Address,
  contractAddress: Address,
  expirationDate: bigint,
) {
  return {
    address: aclAddress,
    abi: aclAbi,
    functionName: "delegateForUserDecryption",
    args: [delegateAddress, contractAddress, expirationDate],
  } as const;
}

/**
 * Returns the contract config to revoke a user decryption delegation.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   revokeDelegationContract(aclAddress, delegateAddress, contractAddress),
 * );
 * ```
 */
export function revokeDelegationContract(
  aclAddress: Address,
  delegateAddress: Address,
  contractAddress: Address,
) {
  return {
    address: aclAddress,
    abi: aclAbi,
    functionName: "revokeDelegationForUserDecryption",
    args: [delegateAddress, contractAddress],
  } as const;
}

/**
 * Returns the contract config to read the delegation expiry date.
 *
 * @example
 * ```ts
 * const expiry = await signer.readContract(
 *   getDelegationExpiryContract(aclAddress, delegatorAddress, delegateAddress, contractAddress),
 * );
 * ```
 */
export function getDelegationExpiryContract(
  aclAddress: Address,
  delegatorAddress: Address,
  delegateAddress: Address,
  contractAddress: Address,
) {
  return {
    address: aclAddress,
    abi: aclAbi,
    functionName: "getUserDecryptionDelegationExpirationDate",
    args: [delegatorAddress, delegateAddress, contractAddress],
  } as const;
}
