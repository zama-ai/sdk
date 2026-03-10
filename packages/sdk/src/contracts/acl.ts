import type { Address } from "viem";
import { ACL_ABI } from "../abi/acl.abi";
import { FHE_GAS_LIMIT } from "./gas";

/**
 * Returns the contract config to delegate user decryption rights.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   delegateForUserDecryptionContract(aclAddress, delegate, contractAddress, expirationDate),
 * );
 * ```
 */
export function delegateForUserDecryptionContract(
  aclAddress: Address,
  delegate: Address,
  contractAddress: Address,
  expirationDate: bigint,
) {
  return {
    address: aclAddress,
    abi: ACL_ABI,
    functionName: "delegateForUserDecryption",
    args: [delegate, contractAddress, expirationDate],
    gas: FHE_GAS_LIMIT,
  } as const;
}

/**
 * Returns the contract config to revoke a user decryption delegation.
 *
 * @example
 * ```ts
 * const txHash = await signer.writeContract(
 *   revokeDelegationContract(aclAddress, delegate, contractAddress),
 * );
 * ```
 */
export function revokeDelegationContract(
  aclAddress: Address,
  delegate: Address,
  contractAddress: Address,
) {
  return {
    address: aclAddress,
    abi: ACL_ABI,
    functionName: "revokeDelegationForUserDecryption",
    args: [delegate, contractAddress],
    gas: FHE_GAS_LIMIT,
  } as const;
}

/**
 * Returns the contract config to read the delegation expiry date.
 *
 * @example
 * ```ts
 * const expiry = await signer.readContract(
 *   getDelegationExpiryContract(aclAddress, delegator, delegate, contractAddress),
 * );
 * ```
 */
export function getDelegationExpiryContract(
  aclAddress: Address,
  delegator: Address,
  delegate: Address,
  contractAddress: Address,
) {
  return {
    address: aclAddress,
    abi: ACL_ABI,
    functionName: "getUserDecryptionDelegationExpirationDate",
    args: [delegator, delegate, contractAddress],
  } as const;
}
