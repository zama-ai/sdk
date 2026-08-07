import { toBytes, toHex, type Hex } from "viem";

/**
 * Wrapping-scheme version, persisted with every wrapped entry so a future scheme is
 * detectable on disk instead of reading as corruption. Shared with the HKDF `info` tag
 * below so the stored number and the derived key can never disagree on the version.
 */
export const WRAPPING_VERSION = 1;

/**
 * Domain-separation tag for the HKDF `info` parameter. Versioned so a future
 * change to the wrapping scheme can run alongside this one without silently
 * reusing (and confusing) derived keys from an earlier version.
 */
const WRAPPING_INFO = `zama-sdk-keypair-wrapping-v${WRAPPING_VERSION}`;
const AES_KEY_LENGTH_BITS = 256;
/** AES-GCM recommended nonce size. Generated fresh per wrap — never reused. */
const GCM_IV_LENGTH_BYTES = 12;

/** On-disk shape of a wrapped private key. Public key and timestamps are stored alongside, unwrapped. */
export interface WrappedPrivateKey {
  wrappedPrivateKey: Hex;
  iv: Hex;
}

/**
 * The sibling plaintext fields stored alongside the ciphertext. Bound as AES-GCM
 * additional authenticated data so a storage-level attacker who can't decrypt the
 * private key also can't silently tamper with these — e.g. mismatching `publicKey`
 * against the wrapped private key, or extending `expiresAt` past its intended TTL.
 */
export interface WrappedPrivateKeyMetadata {
  publicKey: Hex;
  createdAt: number;
  expiresAt: number;
  tkmsVersion?: string;
}

// `new Uint8Array(bytes)` copies into a fresh, plain ArrayBuffer-backed view — needed
// because a consumer-supplied Uint8Array (or viem's `toBytes()` output) is typed as
// `Uint8Array<ArrayBufferLike>`, which TS's DOM lib no longer accepts as `BufferSource`
// (it admits `SharedArrayBuffer`, which `crypto.subtle` doesn't).
function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

/** Deterministic byte encoding of {@link WrappedPrivateKeyMetadata} for use as AES-GCM AAD.
 * An absent `tkmsVersion` encodes as `null`, distinct from any string value. */
function metadataAad(metadata: WrappedPrivateKeyMetadata): Uint8Array<ArrayBuffer> {
  return toBufferSource(
    new TextEncoder().encode(
      JSON.stringify([
        metadata.publicKey,
        metadata.createdAt,
        metadata.expiresAt,
        metadata.tkmsVersion ?? null,
      ]),
    ),
  );
}

function ikmBytes(secret: string | Uint8Array): Uint8Array<ArrayBuffer> {
  return typeof secret === "string" ? new TextEncoder().encode(secret) : toBufferSource(secret);
}

/**
 * Owns the SDK's copy of a derivation secret and hands out the memoized, non-extractable
 * HKDF base key derived from it. Takes ownership of a `Uint8Array` secret: it is zeroized
 * once the import succeeds, which shortens the raw secret's lifetime and keeps it out of
 * accidental readback paths. It does not prevent exfiltration, since the returned key
 * stays usable for deriving.
 */
export class DerivationSecretHolder {
  #secret: string | Uint8Array | undefined;
  #baseKey: Promise<CryptoKey> | undefined;

  constructor(secret: string | Uint8Array) {
    this.#secret = secret;
  }

  async baseKey(): Promise<CryptoKey> {
    if (this.#baseKey === undefined) {
      const pending = this.#importBaseKey();
      // Memoized before the catch so concurrent callers share one import; a failed import
      // is evicted so the still-retained secret can serve a retry.
      this.#baseKey = pending;
      pending.catch(() => {
        if (this.#baseKey === pending) {
          this.#baseKey = undefined;
        }
      });
    }
    return this.#baseKey;
  }

  async #importBaseKey(): Promise<CryptoKey> {
    const secret = this.#secret;
    if (secret === undefined) {
      throw new TypeError("Derivation secret was consumed without a base key being memoized.");
    }
    const ikm = ikmBytes(secret);
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
    ikm.fill(0);
    if (secret instanceof Uint8Array) {
      secret.fill(0);
    }
    // Strings can't be zeroized, so dropping the reference is all that's available.
    this.#secret = undefined;
    return key;
  }
}

/**
 * Derive a non-extractable AES-256-GCM key from the derivation secret's base key, bound
 * to `identity` (the same signer-address-or-scope identity used for storage keying — see
 * {@link TransportKeyPairVault} — not the storage key string itself, so a future rename
 * of storage-key formatting can never silently change already-wrapped keys).
 *
 * Non-extractable by construction: the raw derived key bytes can never be read back out
 * by any caller, this module included.
 */
async function deriveWrappingKey(
  derivationSecret: DerivationSecretHolder,
  identity: string,
): Promise<CryptoKey> {
  const ikmKey = await derivationSecret.baseKey();
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(identity),
      info: new TextEncoder().encode(WRAPPING_INFO),
    },
    ikmKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Wrap a private key for at-rest storage. Generates a fresh random IV every call. */
export async function wrapPrivateKey(
  privateKey: Hex,
  derivationSecret: DerivationSecretHolder,
  identity: string,
  metadata: WrappedPrivateKeyMetadata,
): Promise<WrappedPrivateKey> {
  const key = await deriveWrappingKey(derivationSecret, identity);
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: metadataAad(metadata) },
    key,
    toBufferSource(toBytes(privateKey)),
  );
  return { wrappedPrivateKey: toHex(new Uint8Array(ciphertext)), iv: toHex(iv) };
}

/**
 * Unwrap a private key. `metadata` must be the exact sibling fields stored alongside
 * the ciphertext — mismatching any of them (or a mismatched `derivationSecret`, or a
 * tampered ciphertext) fails the same way, closed.
 *
 * @throws a `DOMException` named `"OperationError"` on any AES-GCM authentication
 *   failure — wrong `derivationSecret`, tampered ciphertext, or tampered `metadata`.
 *   Callers must treat that specific failure as a cache miss, never a crash; see
 *   {@link TransportKeyPairVault}. Any other thrown error (e.g. `crypto.subtle`
 *   unavailable) is not a routine rotation and should not be treated as one.
 */
export async function unwrapPrivateKey(
  wrapped: WrappedPrivateKey,
  derivationSecret: DerivationSecretHolder,
  identity: string,
  metadata: WrappedPrivateKeyMetadata,
): Promise<Hex> {
  const key = await deriveWrappingKey(derivationSecret, identity);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(toBytes(wrapped.iv)),
      additionalData: metadataAad(metadata),
    },
    key,
    toBufferSource(toBytes(wrapped.wrappedPrivateKey)),
  );
  return toHex(new Uint8Array(plaintext));
}

/** True for the specific AES-GCM authentication failure `unwrapPrivateKey` throws on
 * a wrong `derivationSecret`, tampered ciphertext, or tampered metadata — false for
 * anything else (e.g. `crypto.subtle` unavailable), which is not a routine mismatch
 * and should not be handled the same way. Checks `.name` rather than `instanceof
 * DOMException`/`instanceof Error`: those can disagree across realms (e.g. a VM-based
 * test sandbox, or a worker's `crypto.subtle` vs. the main thread's global classes). */
export function isUnwrapAuthFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "OperationError"
  );
}
