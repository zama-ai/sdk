import type { Address, Hex } from "viem";

/**
 * Serializable EIP-712 typed data stored alongside credentials.
 * Uses `number` instead of `bigint` so the object survives JSON round-trips
 * and structured-clone across worker boundaries.
 */
export interface StoredEIP712 {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  primaryType?: string;
  types: Record<string, { name: string; type: string }[]>;
  message: {
    publicKey: Hex;
    contractAddresses: Address[];
    startTimestamp: number;
    durationDays: number;
    extraData: Hex;
  };
}

/** Stored FHE credential data (serialized as JSON in the credential store). */
export interface StoredCredentials {
  /** FHE public key (hex-encoded). */
  publicKey: Hex;
  /** FHE private key (hex-encoded, encrypted at rest via AES-GCM). */
  privateKey: Hex;
  /** EIP-712 signature authorizing decryption. */
  signature: Hex;
  /** Contract addresses this credential is authorized for. */
  contractAddresses: Address[];
  /** Unix timestamp (seconds) when the credential became valid. */
  startTimestamp: number;
  /** Number of days the credential remains valid. */
  durationDays: number;
  /** EIP-712 typed data used to produce the signature */
  eip712: StoredEIP712;
}

/** Stored FHE credential data for delegated decryption. */
export interface DelegatedStoredCredentials extends StoredCredentials {
  /** The address that granted delegation rights. */
  delegatorAddress: Address;
  /** The delegate address performing decryption on behalf of the delegator. */
  delegateAddress: Address;
}
