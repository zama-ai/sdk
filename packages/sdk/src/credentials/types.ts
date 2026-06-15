import type { Hex } from "viem";
import type { z } from "zod/mini";
import type { PermissionSchema, StoredTransportKeyPairSchema } from "./schemas";

/** In-memory transport key pair (ML-KEM public + private key, plaintext private half). */
export interface TransportKeyPair {
  publicKey: Hex;
  privateKey: Hex;
}

/**
 * @deprecated Renamed to {@link TransportKeyPair} to match the FHEVM glossary. The old name is kept
 *   as a public-API back-compat alias and will be removed before the 3.x stable release.
 */
export type Keypair = TransportKeyPair;

/** Persisted transport key pair entry with a bounded lifetime. */
export type StoredTransportKeyPair = z.infer<typeof StoredTransportKeyPairSchema>;

/**
 * @deprecated Renamed to {@link StoredTransportKeyPair} to match the FHEVM glossary. The old name is
 *   kept as a public-API back-compat alias and will be removed before the 3.x stable release.
 */
export type StoredKeypair = StoredTransportKeyPair;

/**
 * A signed EIP-712 permit binding a signer (and optional delegator) to a set of
 * contract addresses for a bounded time window.
 */
export type Permission = z.infer<typeof PermissionSchema>;

/** Resolved credentials for a decrypt operation. */
export interface CredentialBundle {
  readonly keypair: StoredTransportKeyPair;
  readonly permits: readonly Permission[];
}
