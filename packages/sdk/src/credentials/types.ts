import type { Hex } from "viem";
import type { ChecksummedAddress } from "../schemas/primitives";

/**
 * Serialized transport key pair — ML-KEM public + private key as hex, the shape
 * we persist and hand to the decrypt path. Mirrors `@fhevm/sdk`'s
 * `serializeTransportKeyPair` output; the private half is plaintext, so treat it
 * as sensitive.
 */
export interface SerializedTransportKeyPair {
  /** ML-KEM public key, hex-encoded. */
  publicKey: Hex;
  /** ML-KEM private key, hex-encoded (plaintext — treat as sensitive). */
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
  /** EIP-712 domain separator fields. */
  domain: Record<string, unknown>;
  /** Name of the primary type being signed. */
  primaryType?: string;
  /** EIP-712 type definitions keyed by type name. */
  types: Record<string, { name: string; type: string }[]>;
  /** The typed-data message being signed. */
  message: Record<string, unknown>;
}

/**
 * The reusable serialized `@fhevm/sdk` decryption permit persisted inside a
 * {@link Permission} — passed verbatim to `parseSignedDecryptionPermit`.
 *
 * Mirrors {@link SerializedPermitSchema}; kept in sync by a `.test-d.ts` guard.
 */
export interface SerializedPermit {
  /** Serialization format version. */
  version: number;
  /** The EIP-712 typed data that was signed. */
  eip712: SerializedPermitEip712;
  /** The signer's EIP-712 signature, hex-encoded. */
  signature: Hex;
  /** Address that produced the signature. */
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
  /** Public key of the transport key pair this permit is bound to, hex-encoded. */
  keypairPublicKey: Hex;
  /** Contract addresses this permit grants decrypt access to. */
  contractAddresses: ChecksummedAddress[];
  /** The signed serialized permit. */
  serializedPermit: SerializedPermit;
  /** Unix timestamp (seconds) when the permit becomes valid. */
  startTimestamp: number;
  /** Validity window length in days from {@link Permission.startTimestamp}. */
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
