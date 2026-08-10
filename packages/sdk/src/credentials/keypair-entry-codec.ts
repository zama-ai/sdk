/**
 * Single owner of the persisted transport key pair format: what an entry looks like on
 * disk, how a value read back from storage is classified, and how the wrapped shape is
 * encoded and decoded. Everything version-specific lives in a codec descriptor, so a
 * future scheme is added here rather than branched on by every reader.
 */
import { z } from "zod/mini";
import { hex, positiveSeconds, unixSeconds } from "../schemas/primitives";
import {
  unwrapPrivateKey,
  wrapPrivateKey,
  WRAPPING_SCHEME_V1,
  type DerivationSecretHolder,
  type WrappedPrivateKeyMetadata,
} from "./keypair-wrapping";
import { StoredTransportKeyPairSchema } from "./schemas";
import type { StoredTransportKeyPair } from "./types";

const wrappingVersionError = "wrappingVersion must be a wrapping scheme this SDK can read";
const ivLengthError = `iv must be a ${WRAPPING_SCHEME_V1.ivLengthBytes}-byte hex string`;
const wrappedPrivateKeyLengthError = `wrappedPrivateKey must be a whole number of bytes and at least ${WRAPPING_SCHEME_V1.tagLengthBytes} bytes (the AES-GCM authentication tag)`;

function hexByteLength(v: string): number {
  return (v.length - 2) / 2;
}

/**
 * On-disk shape when `transportKeyPairDerivationSecret` is configured, distinct from the
 * plaintext shape every caller outside the vault still sees. `publicKey` is never
 * sensitive and stays unwrapped; only the private key half is encrypted.
 */
const WrappedEntryV1Schema = z.object({
  wrappingVersion: z.literal(WRAPPING_SCHEME_V1.version, { error: wrappingVersionError }),
  publicKey: hex,
  // Length-checked, not just shape-checked: a truncated or bit-flipped ciphertext/IV (e.g.
  // from a buggy custom GenericStorage adapter) would otherwise reach crypto.subtle.decrypt
  // and fail with the same generic OperationError a genuine wrong-secret case does.
  // Even hex length checked first: an odd digit count is a fractional byte count that would
  // clear the minimum (33 digits reads as 16.5 bytes), and viem's toBytes then left-pads it
  // into a plausible-looking ciphertext that only fails at decrypt time.
  wrappedPrivateKey: hex.check(
    z.refine((v) => v.length % 2 === 0 && hexByteLength(v) >= WRAPPING_SCHEME_V1.tagLengthBytes, {
      error: wrappedPrivateKeyLengthError,
    }),
  ),
  iv: hex.check(
    z.refine((v) => hexByteLength(v) === WRAPPING_SCHEME_V1.ivLengthBytes, {
      error: ivLengthError,
    }),
  ),
  createdAt: unixSeconds,
  expiresAt: positiveSeconds,
  tkmsVersion: z.optional(z.string()),
});

/** @internal */
export type WrappedPrivateKeyEntry = z.infer<typeof WrappedEntryV1Schema>;

/** Everything this vault ever hands to `storage.set`. @internal */
export type PersistedTransportKeyPair = StoredTransportKeyPair | WrappedPrivateKeyEntry;

/** One wrapping scheme, complete: its identity on disk, its parameters, and its codec. */
interface WrappedEntryCodec {
  readonly version: number;
  /** HKDF `info` tag the wrapping key is derived under. */
  readonly info: string;
  readonly ivLengthBytes: number;
  readonly tagLengthBytes: number;
  readonly schema: z.ZodMiniType<WrappedPrivateKeyEntry>;
  encode(
    keyPair: StoredTransportKeyPair,
    derivationSecret: DerivationSecretHolder,
    identity: string,
  ): Promise<WrappedPrivateKeyEntry>;
  decode(
    entry: WrappedPrivateKeyEntry,
    derivationSecret: DerivationSecretHolder,
    identity: string,
  ): Promise<StoredTransportKeyPair>;
}

/** The sibling plaintext fields bound as AES-GCM additional authenticated data. */
function metadataOf(entry: {
  publicKey: WrappedPrivateKeyMetadata["publicKey"];
  createdAt: number;
  expiresAt: number;
  tkmsVersion?: string;
}): WrappedPrivateKeyMetadata {
  const metadata: WrappedPrivateKeyMetadata = {
    publicKey: entry.publicKey,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
  };
  if (entry.tkmsVersion) {
    metadata.tkmsVersion = entry.tkmsVersion;
  }
  return metadata;
}

const CODEC_V1: WrappedEntryCodec = {
  ...WRAPPING_SCHEME_V1,
  schema: WrappedEntryV1Schema,
  async encode(keyPair, derivationSecret, identity) {
    const { wrappedPrivateKey, iv } = await wrapPrivateKey(
      keyPair.privateKey,
      derivationSecret,
      identity,
      metadataOf(keyPair),
    );
    const entry: WrappedPrivateKeyEntry = {
      wrappingVersion: WRAPPING_SCHEME_V1.version,
      publicKey: keyPair.publicKey,
      wrappedPrivateKey,
      iv,
      createdAt: keyPair.createdAt,
      expiresAt: keyPair.expiresAt,
    };
    if (keyPair.tkmsVersion) {
      entry.tkmsVersion = keyPair.tkmsVersion;
    }
    return entry;
  },
  async decode(entry, derivationSecret, identity) {
    const privateKey = await unwrapPrivateKey(
      { wrappedPrivateKey: entry.wrappedPrivateKey, iv: entry.iv },
      derivationSecret,
      identity,
      metadataOf(entry),
    );
    const keyPair: StoredTransportKeyPair = {
      publicKey: entry.publicKey,
      privateKey,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    };
    if (entry.tkmsVersion) {
      keyPair.tkmsVersion = entry.tkmsVersion;
    }
    return keyPair;
  },
};

/** Every scheme this build can read, keyed by the version persisted with the entry. */
const CODECS = new Map<number, WrappedEntryCodec>([[CODEC_V1.version, CODEC_V1]]);

/** The scheme new entries are written under. */
const WRITER_CODEC = CODEC_V1;

/**
 * How a raw stored value reads under this build's knowledge of the format. The three
 * failure kinds are distinct because they call for different operator action: an
 * unsupported version needs a build that knows it, a corrupt wrapped entry still holds
 * someone's ciphertext, and an unrecognized value holds nothing worth protecting.
 */
export type ClassifiedEntry =
  | { readonly kind: "plaintext"; readonly keyPair: StoredTransportKeyPair }
  | {
      readonly kind: "wrapped";
      readonly expiresAt: number;
      readonly decode: (
        derivationSecret: DerivationSecretHolder,
        identity: string,
      ) => Promise<StoredTransportKeyPair>;
    }
  | { readonly kind: "unsupported-version"; readonly version: unknown }
  | { readonly kind: "corrupt-wrapped" }
  | { readonly kind: "unrecognized" };

/**
 * Version-agnostic probe for a value that carries a wrapped private key. Deliberately
 * shallow and independent of any codec: an entry written by a scheme this build cannot
 * read must still be recognized as someone's ciphertext, or it gets regenerated over.
 */
function isWrappedEnvelope(raw: object): boolean {
  const entry = raw as Record<string, unknown>;
  return (
    entry.wrappingVersion !== undefined ||
    (entry.wrappedPrivateKey !== undefined && entry.iv !== undefined)
  );
}

/** Classify a value read back from storage. Never throws and never decrypts. */
export function classifyPersistedEntry(raw: unknown): ClassifiedEntry {
  if (typeof raw !== "object" || raw === null || !isWrappedEnvelope(raw)) {
    const plaintext = StoredTransportKeyPairSchema.safeParse(raw);
    return plaintext.success
      ? { kind: "plaintext", keyPair: plaintext.data }
      : { kind: "unrecognized" };
  }

  const version = (raw as Record<string, unknown>).wrappingVersion;
  const codec = typeof version === "number" ? CODECS.get(version) : undefined;
  if (codec === undefined) {
    return { kind: "unsupported-version", version };
  }

  const parsed = codec.schema.safeParse(raw);
  if (!parsed.success) {
    return { kind: "corrupt-wrapped" };
  }
  const entry = parsed.data;
  return {
    kind: "wrapped",
    expiresAt: entry.expiresAt,
    decode: (derivationSecret, identity) => codec.decode(entry, derivationSecret, identity),
  };
}

/** Encode a key pair under the scheme this build writes. */
export function encodeWrappedEntry(
  keyPair: StoredTransportKeyPair,
  derivationSecret: DerivationSecretHolder,
  identity: string,
): Promise<WrappedPrivateKeyEntry> {
  return WRITER_CODEC.encode(keyPair, derivationSecret, identity);
}
