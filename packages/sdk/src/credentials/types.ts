import type { Hex } from "viem";
import type { ChecksummedAddress } from "../schemas/primitives";

/**
 * Serialized transport key pair — ML-KEM public + private key as hex, the shape
 * we persist and hand to the decrypt path. Mirrors `@fhevm/sdk`'s
 * `serializeTransportKeyPair` output; the private half is plaintext, so treat it
 * as sensitive.
 */
export interface SerializedTransportKeyPair {
  publicKey: Hex;
  privateKey: Hex;
}

/**
 * Persisted transport key pair entry with a bounded lifetime.
 *
 * The shape mirrors {@link StoredTransportKeyPairSchema} — a `.test-d.ts` guard
 * asserts the two stay in sync, so the schema can remain an internal detail.
 *
 * @internal
 */
export interface StoredTransportKeyPair {
  publicKey: Hex;
  privateKey: Hex;
  createdAt: number;
  expiresAt: number;
}

/** EIP-712 typed-data payload carried by a {@link SerializedPermit}. */
export interface SerializedPermitEip712 {
  domain: Record<string, unknown>;
  primaryType?: string;
  types: Record<string, { name: string; type: string }[]>;
  message: Record<string, unknown>;
}

/**
 * The reusable serialized `@fhevm/sdk` decryption permit persisted inside a
 * {@link Permission} — passed verbatim to `parseSignedDecryptionPermit`.
 *
 * Mirrors {@link SerializedPermitSchema}; kept in sync by a `.test-d.ts` guard.
 */
export interface SerializedPermit {
  version: number;
  eip712: SerializedPermitEip712;
  signature: Hex;
  signerAddress: ChecksummedAddress;
}

/**
 * A signed EIP-712 permit binding a signer (and optional delegator) to a set of
 * contract addresses for a bounded time window. Wraps the serialized `@fhevm/sdk`
 * permit ({@link SerializedPermit}) alongside the scope/coverage metadata the
 * permission store indexes on.
 *
 * Mirrors {@link PermissionSchema}; kept in sync by a `.test-d.ts` guard.
 */
export interface Permission {
  keypairPublicKey: Hex;
  contractAddresses: ChecksummedAddress[];
  serializedPermit: SerializedPermit;
  startTimestamp: number;
  durationDays: number;
}

/**
 * Credentials resolved for a decrypt operation: the transport key pair plus the
 * permits covering the requested contracts. A live, in-memory bundle — not a
 * storage record. {@link resolvePermit} extracts one {@link ResolvedPermit} from
 * it per contract.
 */
export interface SerializedTransportKeyPairWithPermissions {
  readonly keypair: SerializedTransportKeyPair;
  readonly permissions: readonly Permission[];
}
