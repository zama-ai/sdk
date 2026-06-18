import type { Hex } from "viem";
import type { z } from "zod/mini";
import type { PermissionSchema, StoredTransportKeyPairSchema } from "./schemas";

/** In-memory transport key pair (ML-KEM public + private key, plaintext private half). */
export interface TransportKeyPair {
  publicKey: Hex;
  privateKey: Hex;
}

/** Persisted transport key pair entry with a bounded lifetime. */
export type StoredTransportKeyPair = z.infer<typeof StoredTransportKeyPairSchema>;

/**
 * A signed EIP-712 permit binding a signer (and optional delegator) to a set of
 * contract addresses for a bounded time window.
 */
export type Permission = z.infer<typeof PermissionSchema>;

/** Resolved transport key pair entry with permits for a decrypt operation. */
export interface StoredTransportKeyPairWithPermits {
  readonly keypair: StoredTransportKeyPair;
  readonly permits: readonly Permission[];
}
