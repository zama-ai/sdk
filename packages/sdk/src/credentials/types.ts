import type { Address, Hex } from "viem";
import type { z } from "zod";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
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

/** Generates fresh ML-KEM keypairs. */
export interface KeypairGenerator {
  generateKeypair(): Promise<Keypair>;
}

/** Builds EIP-712 permits for direct and delegated decryption. */
export interface PermitFactory {
  createEIP712(
    publicKey: Hex,
    contracts: Address[],
    startTimestamp: number,
    durationDays: number,
  ): Promise<EIP712TypedData>;
  createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contracts: Address[],
    delegator: Address,
    startTimestamp: number,
    durationDays: number,
  ): Promise<EIP712TypedData>;
}

/** Wallet adapter used by the credential service to obtain identity and signatures. */
export interface PermitSigner {
  signTypedData(td: EIP712TypedData): Promise<Hex>;
  getAddress(): Promise<Address>;
  getChainId(): Promise<number>;
}
