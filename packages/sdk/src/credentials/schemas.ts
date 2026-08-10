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

export const DerivationSecretSchema = z.union(
  [
    z
      .string({ error: derivationSecretError })
      .check(z.minLength(MIN_DERIVATION_SECRET_LENGTH_BYTES, derivationSecretError)),
    z
      .instanceof(Uint8Array, { error: derivationSecretError })
      .check(
        z.refine((v) => v.byteLength >= MIN_DERIVATION_SECRET_LENGTH_BYTES, {
          error: derivationSecretError,
        }),
      ),
  ],
  { error: derivationSecretError },
);

/** @internal */
export const StoredTransportKeyPairSchema = z.object({
  publicKey: hex,
  privateKey: hex,
  createdAt: unixSeconds,
  expiresAt: positiveSeconds,
  tkmsVersion: z.optional(z.string()),
});

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
