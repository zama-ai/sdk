import { Effect } from "effect";
import type { Address } from "../relayer/relayer-sdk.types";
import type { StoredCredentials } from "../token/token.types";
import { Relayer } from "../services/Relayer";
import { Signer } from "../services/Signer";
import { CredentialStorage, SessionStorage } from "../services/Storage";
import { EventEmitter } from "../services/EventEmitter";
import { SigningRejected, SigningFailed } from "../errors";
import { ZamaSDKEvents } from "../events/sdk-events";
import { computeStoreKey, decrypt } from "./crypto";
import { assertObject, assertString, assertArray, assertCondition } from "../utils";
import { create } from "./create";
import type { EncryptedCredentials, SessionEntry } from "./types";

// Re-export types for external use
export type { EncryptedCredentials, SessionEntry } from "./types";

// ── Assertion helpers ──────────────────────────────────────

function assertEncryptedCredentials(data: unknown): asserts data is EncryptedCredentials {
  assertObject(data, "Stored credentials");
  assertString(data.publicKey, "credentials.publicKey");
  assertArray(data.contractAddresses, "credentials.contractAddresses");
  assertObject(data.encryptedPrivateKey, "credentials.encryptedPrivateKey");
  assertString(data.encryptedPrivateKey.iv, "encryptedPrivateKey.iv");
  assertString(data.encryptedPrivateKey.ciphertext, "encryptedPrivateKey.ciphertext");
}

function assertSessionEntry(data: unknown): asserts data is SessionEntry {
  assertObject(data, "Session entry");
  assertString(data.signature, "session.signature");
  assertCondition(typeof data.createdAt === "number", `Expected session.createdAt to be a number`);
  assertCondition(typeof data.ttl === "number", `Expected session.ttl to be a number`);
}

// ── Validation helpers ─────────────────────────────────────

function isSessionExpired(entry: SessionEntry): boolean {
  if (entry.ttl === 0) return true;
  return Math.floor(Date.now() / 1000) - entry.createdAt >= entry.ttl;
}

function isValidTimestamp(
  startTimestamp: number,
  durationDays: number,
  requiredContracts: Address[],
  contractAddresses: Address[],
): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = startTimestamp + durationDays * 86400;
  if (nowSeconds >= expiresAt) return false;
  const signedSet = new Set(contractAddresses.map((a) => a.toLowerCase()));
  return requiredContracts.every((addr) => signedSet.has(addr.toLowerCase()));
}

// ── Internal helpers ───────────────────────────────────────

const getStoreKey = Effect.gen(function* () {
  const signer = yield* Signer;
  const address = (yield* signer.getAddress()).toLowerCase();
  const chainId = yield* signer.getChainId();
  return yield* Effect.promise(() => computeStoreKey(address, chainId));
});

function getSessionEntry(storeKey: string) {
  return Effect.gen(function* () {
    const sessionStorage = yield* SessionStorage;
    const raw = yield* sessionStorage.get(storeKey);
    if (raw === null) return null;
    assertSessionEntry(raw);
    return raw;
  });
}

function decryptCredentials(encrypted: EncryptedCredentials, signature: string) {
  return Effect.gen(function* () {
    const signer = yield* Signer;
    const address = (yield* signer.getAddress()).toLowerCase();
    const privateKey = yield* Effect.promise(() =>
      decrypt(encrypted.encryptedPrivateKey, signature, address),
    );
    const { encryptedPrivateKey: _, ...rest } = encrypted;
    return { ...rest, privateKey, signature } as StoredCredentials;
  });
}

function signEncrypted(encrypted: EncryptedCredentials) {
  return Effect.gen(function* () {
    const relayer = yield* Relayer;
    const signer = yield* Signer;
    const eip712 = yield* relayer
      .createEIP712(
        encrypted.publicKey,
        encrypted.contractAddresses,
        encrypted.startTimestamp,
        encrypted.durationDays,
      )
      .pipe(
        Effect.mapError(
          (e) => new SigningFailed({ message: "Failed to create EIP712", cause: e.cause }),
        ),
      );
    return yield* signer.signTypedData(eip712);
  });
}

// ── Public API ─────────────────────────────────────────────

/**
 * Authorize FHE credentials for one or more contract addresses.
 * Returns cached credentials if still valid and covering all addresses,
 * otherwise generates a fresh keypair and requests an EIP-712 signature.
 */
export function allow(
  contractAddresses: Address[],
  config: { keypairTTL: number; sessionTTL: number },
): Effect.Effect<
  StoredCredentials,
  SigningRejected | SigningFailed,
  Relayer | Signer | CredentialStorage | SessionStorage | EventEmitter
> {
  return Effect.gen(function* () {
    const credentialStorage = yield* CredentialStorage;
    const sessionStorage = yield* SessionStorage;
    const emitter = yield* EventEmitter;

    const storeKey = yield* getStoreKey;
    yield* emitter.emit({ type: ZamaSDKEvents.CredentialsLoading, contractAddresses });

    // Try loading cached credentials
    const cached: StoredCredentials | null = yield* Effect.gen(function* () {
      const stored = yield* credentialStorage.get(storeKey);
      if (stored === null) return null;

      const encrypted = stored as unknown;
      assertEncryptedCredentials(encrypted);

      const sessionEntry = yield* getSessionEntry(storeKey);
      if (sessionEntry) {
        if (isSessionExpired(sessionEntry)) {
          // Session TTL expired — clear and emit, then fall through to re-sign
          yield* sessionStorage.delete(storeKey);
          yield* emitter.emit({ type: ZamaSDKEvents.SessionExpired, reason: "ttl" });
        } else {
          const creds = yield* decryptCredentials(encrypted, sessionEntry.signature);
          if (
            isValidTimestamp(
              creds.startTimestamp,
              creds.durationDays,
              contractAddresses,
              creds.contractAddresses,
            )
          ) {
            yield* emitter.emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
            yield* emitter.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
            return creds;
          }
          yield* emitter.emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
        }
      }

      // No session or TTL expired — try to re-sign if keypair is still valid
      if (
        isValidTimestamp(
          encrypted.startTimestamp,
          encrypted.durationDays,
          contractAddresses,
          encrypted.contractAddresses,
        )
      ) {
        const signature = yield* signEncrypted(encrypted);
        const entry: SessionEntry = {
          signature,
          createdAt: Math.floor(Date.now() / 1000),
          ttl: config.sessionTTL,
        };
        yield* sessionStorage.set(storeKey, entry);
        const creds = yield* decryptCredentials(encrypted, signature);
        yield* emitter.emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
        yield* emitter.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
        return creds;
      }

      yield* emitter.emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
      return null;
    }).pipe(
      Effect.catchAll(() =>
        // Any error during cache check — delete stored, fall through to create
        credentialStorage.delete(storeKey).pipe(
          Effect.catchAll(() => Effect.void),
          Effect.map(() => null),
        ),
      ),
    );

    if (cached !== null) return cached;

    // Create fresh credentials
    const creds = yield* create(contractAddresses, config.keypairTTL, config.sessionTTL);
    yield* emitter.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
    return creds;
  });
}

/**
 * Check if stored credentials exist and are expired.
 * Returns `true` if credentials are stored but past their expiration time.
 * Returns `false` if no credentials are stored or if they are still valid.
 */
export function isExpired(
  contractAddress?: Address,
): Effect.Effect<boolean, never, Signer | CredentialStorage> {
  return Effect.gen(function* () {
    const credentialStorage = yield* CredentialStorage;
    const storeKey = yield* getStoreKey;

    const stored = yield* credentialStorage.get(storeKey);
    if (stored === null) return false;

    const encrypted = stored as unknown;
    assertEncryptedCredentials(encrypted);

    const requiredContracts = contractAddress ? [contractAddress] : [];
    return !isValidTimestamp(
      encrypted.startTimestamp,
      encrypted.durationDays,
      requiredContracts,
      encrypted.contractAddresses,
    );
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));
}

/**
 * Revoke the session signature for the connected wallet.
 */
export function revoke(
  ...contractAddresses: Address[]
): Effect.Effect<void, never, Signer | SessionStorage | EventEmitter> {
  return Effect.gen(function* () {
    const sessionStorage = yield* SessionStorage;
    const emitter = yield* EventEmitter;
    const storeKey = yield* getStoreKey;

    yield* sessionStorage.delete(storeKey);
    yield* emitter.emit({
      type: ZamaSDKEvents.CredentialsRevoked,
      ...(contractAddresses.length > 0 && { contractAddresses }),
    });
  });
}

/**
 * Whether a session signature is currently cached for the connected wallet.
 */
export function isAllowed(): Effect.Effect<boolean, never, Signer | SessionStorage> {
  return Effect.gen(function* () {
    const storeKey = yield* getStoreKey;
    const entry = yield* getSessionEntry(storeKey);
    if (entry === null) return false;
    return !isSessionExpired(entry);
  });
}

/**
 * Delete stored credentials and session for the connected wallet (best-effort).
 */
export function clear(): Effect.Effect<void, never, Signer | CredentialStorage | SessionStorage> {
  return Effect.gen(function* () {
    const credentialStorage = yield* CredentialStorage;
    const sessionStorage = yield* SessionStorage;
    const storeKey = yield* getStoreKey;

    yield* sessionStorage.delete(storeKey);
    yield* credentialStorage.delete(storeKey).pipe(Effect.catchAll(() => Effect.void));
  });
}
