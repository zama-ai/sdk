import { z } from "zod/mini";
import {
  checksummedAddress,
  hex,
  positiveDays,
  positiveSeconds,
  unixSeconds,
} from "../schemas/primitives";
import { MAX_CONTRACTS_PER_PERMIT, SECONDS_PER_DAY } from "./utils";

const transportKeyPairTTLError = "transportKeyPairTTL must be a positive integer number of seconds";
const permitTTLError = "permitTTL must be a positive integer number of days";
const transportKeyPairScopeError = "transportKeyPairScope must be a non-empty string";
/** 256 bits — matches the AES-256 wrapping key this secret feeds through HKDF, so the derived key
 * is never weaker than the cipher it protects. A length check can't verify actual entropy, so this
 * is a floor, not a guarantee: callers must still source transportKeyPairDerivationSecret from a
 * CSPRNG or secrets manager, never a human-memorable passphrase (HKDF does no key-stretching). */
export const MIN_DERIVATION_SECRET_LENGTH_BYTES = 32;
const derivationSecretError = `transportKeyPairDerivationSecret must be a string or Uint8Array of at least ${MIN_DERIVATION_SECRET_LENGTH_BYTES} bytes (256 bits) of real entropy — source it from a CSPRNG or secrets manager, not a human-memorable passphrase`;

/** AES-GCM nonce size this SDK always generates — see `keypair-wrapping.ts`. */
const GCM_IV_LENGTH_BYTES = 12;
/** AES-GCM authentication tag size; any valid ciphertext is at least this long. */
const GCM_TAG_LENGTH_BYTES = 16;
const ivLengthError = `iv must be a ${GCM_IV_LENGTH_BYTES}-byte hex string`;
const wrappedPrivateKeyLengthError = `wrappedPrivateKey must be a whole number of bytes and at least ${GCM_TAG_LENGTH_BYTES} bytes (the AES-GCM authentication tag)`;

function hexByteLength(v: string): number {
  return (v.length - 2) / 2;
}

/** Maximum transportKeyPairTTL accepted by the fhevm ACL contract (365 days, in seconds). */
export const MAX_TRANSPORT_KEY_PAIR_TTL_SECONDS = 365 * SECONDS_PER_DAY;

// z.int already rejects NaN, Infinity, and non-integers, so it covers
// the previous .finite() + .int() combo with a single schema.
export const TransportKeyPairTTLSchema = z
  .int({ error: transportKeyPairTTLError })
  .check(
    z.positive({ error: transportKeyPairTTLError }),
    z.maximum(
      MAX_TRANSPORT_KEY_PAIR_TTL_SECONDS,
      `transportKeyPairTTL must not exceed the fhevm ACL maximum of ${MAX_TRANSPORT_KEY_PAIR_TTL_SECONDS}s (365 days)`,
    ),
  );

export const PermitTTLSchema = z
  .int({ error: permitTTLError })
  .check(z.positive({ error: permitTTLError }));

export const TransportKeyPairScopeSchema = z
  .string({ error: transportKeyPairScopeError })
  .check(z.minLength(1, transportKeyPairScopeError));

export const DerivationSecretSchema = z.union([
  z.string().check(z.minLength(MIN_DERIVATION_SECRET_LENGTH_BYTES, derivationSecretError)),
  z
    .instanceof(Uint8Array)
    .check(
      z.refine((v) => v.byteLength >= MIN_DERIVATION_SECRET_LENGTH_BYTES, {
        error: derivationSecretError,
      }),
    ),
]);

/** @internal */
export const StoredTransportKeyPairSchema = z.object({
  publicKey: hex,
  privateKey: hex,
  createdAt: unixSeconds,
  expiresAt: positiveSeconds,
  tkmsVersion: z.optional(z.string()),
});

/**
 * On-disk shape when `transportKeyPairDerivationSecret` is configured — distinct from
 * {@link StoredTransportKeyPairSchema}, which is the in-memory/plaintext shape every
 * caller outside {@link TransportKeyPairVault} still sees. `publicKey` is never
 * sensitive and stays unwrapped; only the private key half is encrypted.
 */
export const WrappedPrivateKeyEntrySchema = z.object({
  publicKey: hex,
  // Length-checked, not just shape-checked: a truncated or bit-flipped ciphertext/IV
  // (e.g. from a buggy custom GenericStorage adapter) would otherwise reach
  // crypto.subtle.decrypt and fail with the same generic OperationError a genuine wrong-secret
  // case does — catching it here, pre-decrypt, avoids that ambiguity for the cases that
  // structurally can't be a real ciphertext at all.
  // Even hex length checked first: an odd digit count is a fractional byte count that
  // would clear the minimum (33 digits reads as 16.5 bytes), and viem's toBytes then
  // left-pads it into a plausible-looking ciphertext that only fails at decrypt time.
  wrappedPrivateKey: hex.check(
    z.refine((v) => v.length % 2 === 0 && hexByteLength(v) >= GCM_TAG_LENGTH_BYTES, {
      error: wrappedPrivateKeyLengthError,
    }),
  ),
  iv: hex.check(
    z.refine((v) => hexByteLength(v) === GCM_IV_LENGTH_BYTES, { error: ivLengthError }),
  ),
  createdAt: unixSeconds,
  expiresAt: positiveSeconds,
  tkmsVersion: z.optional(z.string()),
});

/** @internal */
export type WrappedPrivateKeyEntry = z.infer<typeof WrappedPrivateKeyEntrySchema>;

export const Eip712Schema = z.object({
  domain: z.record(z.string(), z.unknown()),
  primaryType: z.optional(z.string()),
  types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() }))),
  message: z.record(z.string(), z.unknown()),
});

export const SerializedPermitSchema = z.object({
  version: z.int().check(z.positive()),
  eip712: Eip712Schema,
  signature: hex,
  signerAddress: checksummedAddress,
});

/** @internal */
export const PermissionSchema = z.object({
  keypairPublicKey: hex,
  contractAddresses: z.array(checksummedAddress).check(z.maxLength(MAX_CONTRACTS_PER_PERMIT)),
  serializedPermit: SerializedPermitSchema,
  startTimestamp: unixSeconds,
  durationDays: positiveDays,
});

export const PermissionListSchema = z.array(PermissionSchema);

export const ScopeIndexSchema = z.array(z.string());
