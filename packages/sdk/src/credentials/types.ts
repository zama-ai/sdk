import type { Hex } from "viem";
import type { z } from "zod/mini";
import type { PermissionSchema, StoredKeypairSchema } from "./schemas";

/** In-memory FHE keypair (plaintext private key). */
export interface Keypair {
  publicKey: Hex;
  privateKey: Hex;
}

/** Persisted FHE keypair entry with a bounded lifetime. */
export type StoredKeypair = z.infer<typeof StoredKeypairSchema>;

/**
 * A signed EIP-712 permit binding a signer (and optional delegator) to a set of
 * contract addresses for a bounded time window.
 */
export type Permission = z.infer<typeof PermissionSchema>;

/** Resolved credentials for a decrypt operation. */
export interface CredentialBundle {
  readonly keypair: StoredKeypair;
  readonly permits: readonly Permission[];
}
