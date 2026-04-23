import type { Address } from "../utils/address";
import type { Hex } from "../utils/hex";

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
}

/** Stored FHE credential data for delegated decryption. */
export interface DelegatedStoredCredentials extends StoredCredentials {
  /** The address that granted delegation rights. */
  delegatorAddress: Address;
  /** The delegate address performing decryption on behalf of the delegator. */
  delegateAddress: Address;
}
