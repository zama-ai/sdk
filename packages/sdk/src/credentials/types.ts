import type { Address, Hex } from "viem";
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
  /**
   * The TKMS version the key pair was generated under, passed back to
   * `parseTransportKeyPair` so the private key deserializes under the right
   * version after a KMS/TKMS rotation. Optional — key pairs serialized before
   * this tag existed carry none.
   */
  tkmsVersion?: string;
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
  /** TKMS version the key pair was generated under; see {@link SerializedTransportKeyPair.tkmsVersion}. */
  tkmsVersion?: string;
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
 * Fields shared by every permit version, regardless of shape. Mirrors
 * `PermissionBaseSchema`.
 */
export interface PermissionBase {
  /** Public key of the transport key pair this permit is bound to, hex-encoded. */
  keypairPublicKey: Hex;
  /**
   * Contract addresses this permit grants decrypt access to. Never empty for
   * a V1 permit; an empty list on a V2 permit is a wildcard — see {@link PermissionV2}.
   */
  contractAddresses: ChecksummedAddress[];
  /** The signed serialized permit. */
  serializedPermit: SerializedPermit;
  /** Unix timestamp (seconds) when the permit becomes valid. */
  startTimestamp: number;
}

/** A V1 ("legacy") permit — always scoped to a specific, non-empty contract list. */
export interface PermissionV1 extends PermissionBase {
  /** Discriminant — always `1` for a V1 permit. */
  version: 1;
  /** Validity window length in days from {@link PermissionBase.startTimestamp}. */
  durationDays: number;
}

/**
 * A V2 (unified) permit. `contractAddresses: []` is a *wildcard* (permissive)
 * permit — it covers every contract, not zero.
 */
export interface PermissionV2 extends PermissionBase {
  /** Discriminant — always `2` for a V2 permit. */
  version: 2;
  /** Validity window length in seconds from {@link PermissionBase.startTimestamp}. */
  durationSeconds: number;
}

/**
 * A signed EIP-712 permit binding a signer (and optional delegator) to a set of
 * contract addresses for a bounded time window. Wraps the serialized `@fhevm/sdk`
 * permit ({@link SerializedPermit}) alongside the scope/coverage metadata the
 * permission store indexes on.
 *
 * Discriminated by `version`: {@link PermissionV1} or {@link PermissionV2}.
 * Mirrors {@link PermissionSchema}; kept in sync by a `.test-d.ts` guard.
 */
export type Permission = PermissionV1 | PermissionV2;

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

/**
 * Offline `preparePermit` request — `grantPermit`'s parameters split around
 * the wallet signature. `signer` and `delegator` are explicit addresses, not
 * read from a connected wallet: preparing works without a configured signer,
 * which is the point of the offline flow.
 */
export interface PreparePermitRequest {
  /** Address that will sign the returned EIP-712 typed data. */
  signer: Address;
  /** Contract addresses to authorize. Maximum {@link MAX_CONTRACTS_PER_PERMIT} — no chunking. */
  contracts: readonly Address[];
  /** Delegator address, for a delegated permit. Omit for a self permit. */
  delegator?: Address;
  /** Permit validity window in days. Defaults to the SDK's configured `permitTTL`. */
  durationDays?: number;
}

/**
 * Offline permit flow, phase 1 output — the unsigned EIP-712 typed data
 * {@link registerPermit} needs to verify and persist the signature an
 * out-of-process signer returns for it.
 *
 * Deliberately minimal: `chainId`, `contracts`, `startTimestamp`,
 * `durationDays`, and the transport public key are all readable off
 * {@link eip712}'s `domain`/`message` directly (and, once registered, off the
 * signature-verified payload) — carrying separate top-level copies would only
 * create two sources of truth that could disagree. Read them from `eip712`
 * for display/logging use.
 *
 * `version` pins the permit shape (`1` while the SDK targets protocol ≤0.13)
 * so a future V2 flow is additive, not breaking. JSON-safe — ships across a
 * process boundary as-is.
 */
export interface PreparedPermit {
  /** Permit format version. Always `1` while the SDK targets protocol ≤0.13. */
  version: 1;
  /** The EIP-712 typed data to sign with `eth_signTypedData_v4`. */
  eip712: SerializedPermitEip712;
  /** Address expected to sign {@link eip712}. */
  signerAddress: ChecksummedAddress;
}
