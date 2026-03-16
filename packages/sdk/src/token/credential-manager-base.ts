import type { Address, Hex } from "viem";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import { CredentialCrypto } from "./credential-crypto";
import type { BaseEncryptedCredentials } from "./credential-validation";
import {
  coversContracts,
  isCredentialValid,
  isTimeValid,
  normalizeAddresses,
} from "./credential-validation";
import { SigningFailedError, SigningRejectedError, wrapSigningError } from "./errors";
import { SessionSignatures } from "./session-signatures";
import type { GenericSigner, GenericStorage, StoredCredentials } from "./token.types";

/** Shared configuration accepted by both credential manager variants. */
export interface CredentialsConfig {
  /** Backend that generates FHE keypairs (public/private). */
  relayer: { generateKeypair(): Promise<{ publicKey: Hex; privateKey: Hex }> };
  /** Wallet signer used for EIP-712 authorization signatures. */
  signer: GenericSigner;
  /** Persistent storage for encrypted credentials. */
  storage: GenericStorage;
  /** Storage for session signatures (shorter-lived than credentials). */
  sessionStorage: GenericStorage;
  /** FHE keypair lifetime in seconds. Defaults to `86400` (1 day). */
  keypairTTL?: number;
  /** Session signature lifetime. `0` = always re-sign, `"infinite"` = never expire. Defaults to `2592000` (30 days). */
  sessionTTL?: number | "infinite";
  /** Optional listener for credential lifecycle events. */
  onEvent?: ZamaSDKEventListener;
}

/** Minimal fields needed to produce an EIP-712 signing request. */
export interface SigningMeta {
  /** FHE public key being authorized. */
  publicKey: Hex;
  /** Epoch seconds when the keypair authorization begins. */
  startTimestamp: number;
  /** Number of days the keypair authorization is valid for. */
  durationDays: number;
  /** Delegator address, present only for delegated credentials. */
  delegatorAddress?: string;
}

/** Options for {@link BaseCredentialsManager.resolveCredentials}. */
interface ResolveCredentialsOptions<TCreds> {
  /** Storage key identifying the credential entry. */
  key: string;
  /** Contract addresses the caller needs access to. */
  contracts: Address[];
  /** Deduplication key — concurrent calls with the same key share a single creation promise. */
  createKey: string;
  /** Factory that creates fresh credentials when nothing usable is cached. */
  createFn: () => Promise<TCreds>;
}

/** Options for {@link BaseCredentialsManager.createCredentials}. */
interface CreateCredentialsOptions<TCreds> {
  /** Storage key identifying the credential entry. */
  key: string;
  /** Contract addresses being authorized. */
  contractAddresses: Address[];
  /** Factory that builds the credential payload (keypair + signature). */
  createFn: () => Promise<TCreds>;
  /** Human-readable context included in signing error messages. */
  errorContext: string;
}

/**
 * Abstract base for credential managers. Contains the entire allow/extend/expire
 * state machine. Subclasses provide the assertion, signing, and encrypt/decrypt
 * hooks that differ between regular and delegated flows.
 *
 * @typeParam TCreds    - The in-memory credential shape (includes plaintext privateKey).
 * @typeParam TEncrypted - The on-disk shape (privateKey replaced by encryptedPrivateKey).
 */
export abstract class BaseCredentialsManager<
  TCreds extends StoredCredentials,
  TEncrypted extends BaseEncryptedCredentials,
> {
  protected readonly signer: GenericSigner;
  protected readonly storage: GenericStorage;
  protected readonly sessionSignatures: SessionSignatures;
  protected readonly crypto: CredentialCrypto;
  protected readonly keypairTTL: number;
  protected readonly sessionTTL: number | "infinite";

  #onEvent: ZamaSDKEventListener;
  #createPromise: Promise<TCreds> | null = null;
  #createPromiseKey: string | null = null;
  #extendPromise: Promise<TCreds> | null = null;

  constructor(config: CredentialsConfig) {
    this.signer = config.signer;
    this.storage = config.storage;
    this.sessionSignatures = new SessionSignatures(config.sessionStorage);
    this.crypto = new CredentialCrypto();
    this.keypairTTL = config.keypairTTL ?? 86400;
    this.sessionTTL = config.sessionTTL ?? 2592000;
    this.#onEvent = config.onEvent ?? (() => {});

    if (typeof this.keypairTTL === "number" && this.keypairTTL < 0) {
      throw new Error("keypairTTL must be >= 0");
    }
    if (typeof this.sessionTTL === "number" && this.sessionTTL < 0) {
      throw new Error("sessionTTL must be >= 0");
    }
  }

  /** Emit a credential lifecycle event, stamped with the current time. */
  protected emit(partial: ZamaSDKEventInput): void {
    this.#onEvent({ ...partial, timestamp: Date.now() } as never);
  }

  // ── Abstract hooks ────────────────────────────────────────────

  /** Validate that raw storage data matches the expected encrypted shape. */
  protected abstract assertEncrypted(data: unknown): asserts data is TEncrypted;

  /** Sign an EIP-712 authorization for the given contract addresses. */
  protected abstract signForContracts(
    meta: SigningMeta,
    contractAddresses: Address[],
  ): Promise<Hex>;

  /** Encrypt credentials for persistent storage. */
  protected abstract encryptCredentials(creds: TCreds): Promise<TEncrypted>;

  /** Decrypt credentials from persistent storage. */
  protected abstract decryptCredentials(encrypted: TEncrypted, signature: Hex): Promise<TCreds>;

  // ── Core credential resolution ────────────────────────────────

  /**
   * The allow() state machine: load → validate → extend/re-sign → or create fresh.
   * Subclasses call this from their public `allow()` after computing the key.
   */
  protected async resolveCredentials({
    key,
    contracts,
    createKey,
    createFn,
  }: ResolveCredentialsOptions<TCreds>): Promise<TCreds> {
    this.emit({ type: ZamaSDKEvents.CredentialsLoading, contractAddresses: contracts });

    try {
      const encrypted = await this.storage.get<TEncrypted>(key);
      if (encrypted) {
        this.assertEncrypted(encrypted);

        const sessionEntry = await this.sessionSignatures.get(key);
        if (sessionEntry) {
          if (this.sessionSignatures.isExpired(sessionEntry)) {
            await this.sessionSignatures.delete(key);
            this.emit({ type: ZamaSDKEvents.SessionExpired, reason: "ttl" });
          } else {
            const creds = await this.decryptCredentials(encrypted, sessionEntry.signature);
            if (isCredentialValid(creds, contracts)) {
              this.emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses: contracts });
              this.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: contracts });
              return creds;
            }
            if (isTimeValid(creds)) {
              return this.#extendContracts({
                key,
                credentials: creds,
                requiredContracts: contracts,
              });
            }
            this.emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses: contracts });
          }
        }

        // No session or expired — need to re-sign
        if (isTimeValid(encrypted)) {
          if (coversContracts(encrypted.contractAddresses, contracts)) {
            const signature = await this.signForContracts(encrypted, encrypted.contractAddresses);
            await this.sessionSignatures.set({ key, signature, ttl: this.sessionTTL });
            const creds = await this.decryptCredentials(encrypted, signature);
            this.emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses: contracts });
            this.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: contracts });
            return creds;
          }
          // Time-valid but missing contracts — sign with old set to decrypt, then extend
          const oldSignature = await this.signForContracts(encrypted, encrypted.contractAddresses);
          const creds = await this.decryptCredentials(encrypted, oldSignature);
          return this.#extendContracts({
            key,
            credentials: creds,
            requiredContracts: contracts,
          });
        }

        this.emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses: contracts });
      }
    } catch (error) {
      if (error instanceof SigningRejectedError || error instanceof SigningFailedError) {
        throw error;
      }
      console.warn("[zama-sdk] Credential resolution failed, recreating:", error);
      await this.#deleteCredentials(key);
    }

    // Nothing cached — create fresh (deduplicated)
    if (!this.#createPromise || this.#createPromiseKey !== createKey) {
      this.#createPromiseKey = createKey;
      this.#createPromise = createFn()
        .then((creds) => {
          this.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: contracts });
          return creds;
        })
        .finally(() => {
          this.#createPromise = null;
          this.#createPromiseKey = null;
        });
    }
    return this.#createPromise;
  }

  // ── Shared public method implementations ──────────────────────

  /**
   * Check whether stored credentials are expired or don't cover the given contract.
   * Returns `true` if credentials are missing, expired, or corrupted.
   */
  protected async checkExpired(key: string, contractAddress?: Address): Promise<boolean> {
    try {
      const stored = await this.storage.get<TEncrypted>(key);
      if (!stored) {
        return false;
      }
      this.assertEncrypted(stored);
      const requiredContracts = contractAddress ? [contractAddress] : [];
      return !isCredentialValid(stored, requiredContracts);
    } catch (error) {
      console.warn("[zama-sdk] isExpired check failed, treating as expired:", error);
      return true;
    }
  }

  /** Delete the session signature and clear caches, forcing a fresh wallet signature on next use. */
  protected async revokeSession(key: string, contractAddresses?: Address[]): Promise<void> {
    await this.sessionSignatures.delete(key);
    this.clearCaches();
    this.emit({
      type: ZamaSDKEvents.CredentialsRevoked,
      ...(contractAddresses ? { contractAddresses } : {}),
    } as ZamaSDKEventInput);
  }

  protected async checkAllowed(key: string): Promise<boolean> {
    const entry = await this.sessionSignatures.get(key);
    if (entry === null) {
      return false;
    }
    return !this.sessionSignatures.isExpired(entry);
  }

  protected async clearAll(key: string): Promise<void> {
    await this.sessionSignatures.delete(key);
    this.clearCaches();
    await this.#deleteCredentials(key);
  }

  /** Override to also clear subclass-specific caches (e.g. key cache). */
  protected clearCaches(): void {
    this.crypto.clearCache();
  }

  // ── Credential creation helper ────────────────────────────────

  /**
   * Shared wrapper for fresh credential creation:
   * emits events, persists, saves session, and wraps signing errors.
   */
  protected async createCredentials({
    key,
    contractAddresses,
    createFn,
    errorContext,
  }: CreateCredentialsOptions<TCreds>): Promise<TCreds> {
    this.emit({ type: ZamaSDKEvents.CredentialsCreating, contractAddresses });
    try {
      const creds = await createFn();
      await this.persistCredentials(key, creds);
      await this.sessionSignatures.set({
        key,
        signature: creds.signature,
        ttl: this.sessionTTL,
      });
      this.emit({ type: ZamaSDKEvents.CredentialsCreated, contractAddresses });
      return creds;
    } catch (error) {
      wrapSigningError(error, errorContext);
    }
  }

  // ── Contract extension ────────────────────────────────────────

  async #extendContracts({
    key,
    credentials,
    requiredContracts,
  }: {
    key: string;
    credentials: TCreds;
    requiredContracts: Address[];
  }): Promise<TCreds> {
    if (this.#extendPromise) {
      const previous = await this.#extendPromise;
      if (coversContracts(previous.contractAddresses, requiredContracts)) {
        this.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: requiredContracts });
        return previous;
      }
      credentials = previous;
    }

    const promise = this.#extendCredentials({ key, credentials, requiredContracts });
    this.#extendPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.#extendPromise === promise) {
        this.#extendPromise = null;
      }
    }
  }

  async #extendCredentials({
    key,
    credentials,
    requiredContracts,
  }: {
    key: string;
    credentials: TCreds;
    requiredContracts: Address[];
  }): Promise<TCreds> {
    const merged = normalizeAddresses([...credentials.contractAddresses, ...requiredContracts]);
    const signature = await this.signForContracts(credentials, merged);

    const extended: TCreds = { ...credentials, contractAddresses: merged, signature };
    // Persist ciphertext before session signature to prevent a window where a
    // concurrent reader sees the new signature but finds old ciphertext.
    await this.persistCredentials(key, extended);
    await this.sessionSignatures.set({
      key,
      signature,
      ttl: this.sessionTTL,
    });
    this.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: requiredContracts });
    return extended;
  }

  protected async persistCredentials(key: string, credentials: TCreds): Promise<void> {
    try {
      const encrypted = await this.encryptCredentials(credentials);
      await this.storage.set(key, encrypted);
    } catch (error) {
      console.warn("[zama-sdk] Failed to encrypt credentials for persistence:", error);
      return;
    }
  }

  async #deleteCredentials(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      console.warn("[zama-sdk] Failed to delete credentials:", error);
    }
  }
}
