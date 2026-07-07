import type { Hex } from "viem";
import type { z } from "zod/mini";
import type {
  PermissionSchema,
  SerializedPermitSchema,
  StoredTransportKeyPairSchema,
} from "./schemas";

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

/** Persisted transport key pair entry with a bounded lifetime. */
export type StoredTransportKeyPair = z.infer<typeof StoredTransportKeyPairSchema>;

/**
 * The reusable serialized `@fhevm/sdk` decryption permit persisted inside a
 * {@link Permission} — passed verbatim to `parseSignedDecryptionPermit`.
 */
export type SerializedPermit = z.infer<typeof SerializedPermitSchema>;

/**
 * A signed EIP-712 permit binding a signer (and optional delegator) to a set of
 * contract addresses for a bounded time window. Wraps the serialized `@fhevm/sdk`
 * permit ({@link SerializedPermit}) alongside the scope/coverage metadata the
 * permission store indexes on.
 */
export type Permission = z.infer<typeof PermissionSchema>;

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
