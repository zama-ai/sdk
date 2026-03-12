import { type Address, type Hex } from "viem";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import { CredentialCrypto } from "./credential-crypto";
import { deleteCredentials, persistCredentials } from "./credential-persistence";
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
  relayer: { generateKeypair(): Promise<{ publicKey: Hex; privateKey: Hex }> };
  signer: GenericSigner;
  storage: GenericStorage;
  sessionStorage: GenericStorage;
  keypairTTL?: number;
  sessionTTL?: number | "infinite";
  onEvent?: ZamaSDKEventListener;
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
    this.#onEvent = config.onEvent ?? Boolean;
    if (typeof this.keypairTTL === "number" && this.keypairTTL < 0) {
      throw new Error("keypairTTL must be >= 0");
    }
    if (typeof this.sessionTTL === "number" && this.sessionTTL < 0) {
      throw new Error("sessionTTL must be >= 0");
    }
  }

  protected emit(partial: ZamaSDKEventInput): void {
    this.#onEvent({ ...partial, timestamp: Date.now() } as never);
  }

  // ── Abstract hooks ────────────────────────────────────────────

  /** Validate that raw storage data matches the expected encrypted shape. */
  protected abstract assertEncrypted(data: unknown): asserts data is TEncrypted;

  /** Sign an EIP-712 authorization for the given contract addresses. */
  protected abstract signForContracts(
    meta: TEncrypted | TCreds,
    contractAddresses: Address[],
  ): Promise<Hex>;

  /** Encrypt credentials for persistent storage. */
  protected abstract encryptCreds(creds: TCreds): Promise<TEncrypted>;

  /** Decrypt credentials from persistent storage. */
  protected abstract decryptCreds(encrypted: TEncrypted, signature: Hex): Promise<TCreds>;

  // ── Core credential resolution ────────────────────────────────

  /**
   * The allow() state machine: load → validate → extend/re-sign → or create fresh.
   * Subclasses call this from their public `allow()` after computing the storeKey.
   */
  protected async resolveCredentials(
    storeKey: string,
    contracts: Address[],
    createKey: string,
    createFn: () => Promise<TCreds>,
  ): Promise<TCreds> {
    this.emit({ type: ZamaSDKEvents.CredentialsLoading, contractAddresses: contracts });

    try {
      const encrypted = await this.storage.get<TEncrypted>(storeKey);
      if (encrypted) {
        this.assertEncrypted(encrypted);

        const sessionEntry = await this.sessionSignatures.get(storeKey);
        if (sessionEntry) {
          if (this.sessionSignatures.isExpired(sessionEntry)) {
            await this.sessionSignatures.delete(storeKey);
            this.emit({ type: ZamaSDKEvents.SessionExpired, reason: "ttl" });
          } else {
            const creds = await this.decryptCreds(encrypted, sessionEntry.signature);
            if (isCredentialValid(creds, contracts)) {
              this.emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses: contracts });
              this.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: contracts });
              return creds;
            }
            if (isTimeValid(creds)) {
              return this.#extendContracts({
                storeKey,
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
            await this.sessionSignatures.set(storeKey, signature, this.sessionTTL);
            const creds = await this.decryptCreds(encrypted, signature);
            this.emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses: contracts });
            this.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: contracts });
            return creds;
          }
          // Time-valid but missing contracts — sign with old set to decrypt, then extend
          const oldSignature = await this.signForContracts(encrypted, encrypted.contractAddresses);
          const creds = await this.decryptCreds(encrypted, oldSignature);
          return this.#extendContracts({
            storeKey,
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
      await deleteCredentials(this.storage, storeKey);
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

  protected async checkExpired(storeKey: string, contractAddress?: Address): Promise<boolean> {
    try {
      const stored = await this.storage.get(storeKey);
      if (!stored) return false;
      this.assertEncrypted(stored as unknown);
      const requiredContracts = contractAddress ? [contractAddress] : [];
      return !isCredentialValid(stored as TEncrypted, requiredContracts);
    } catch (error) {
      console.warn("[zama-sdk] isExpired check failed, treating as expired:", error);
      return true;
    }
  }

  protected async revokeSession(
    storeKey: string,
    eventExtra?: Record<string, unknown>,
  ): Promise<void> {
    await this.sessionSignatures.delete(storeKey);
    this.clearCaches();
    this.emit({ type: ZamaSDKEvents.CredentialsRevoked, ...eventExtra } as ZamaSDKEventInput);
  }

  protected async checkAllowed(storeKey: string): Promise<boolean> {
    const entry = await this.sessionSignatures.get(storeKey);
    if (entry === null) return false;
    return !this.sessionSignatures.isExpired(entry);
  }

  protected async clearAll(storeKey: string): Promise<void> {
    await this.sessionSignatures.delete(storeKey);
    this.clearCaches();
    await deleteCredentials(this.storage, storeKey);
  }

  /** Override to also clear subclass-specific caches (e.g. storeKey cache). */
  protected clearCaches(): void {
    this.crypto.clearCache();
  }

  // ── Credential creation helper ────────────────────────────────

  /**
   * Shared wrapper for fresh credential creation:
   * emits events, persists, saves session, and wraps signing errors.
   */
  protected async createFreshCredentials(
    storeKey: string,
    contractAddresses: Address[],
    buildFn: () => Promise<TCreds>,
    errorContext: string,
  ): Promise<TCreds> {
    this.emit({ type: ZamaSDKEvents.CredentialsCreating, contractAddresses });
    try {
      const creds = await buildFn();
      await this.persistCreds(storeKey, creds);
      await this.sessionSignatures.set(storeKey, creds.signature, this.sessionTTL);
      this.emit({ type: ZamaSDKEvents.CredentialsCreated, contractAddresses });
      return creds;
    } catch (error) {
      wrapSigningError(error, errorContext);
    }
  }

  // ── Contract extension ────────────────────────────────────────

  async #extendContracts({
    storeKey,
    credentials,
    requiredContracts,
  }: {
    storeKey: string;
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

    const promise = this.#performExtend({ storeKey, credentials, requiredContracts });
    this.#extendPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.#extendPromise === promise) this.#extendPromise = null;
    }
  }

  async #performExtend({
    storeKey,
    credentials,
    requiredContracts,
  }: {
    storeKey: string;
    credentials: TCreds;
    requiredContracts: Address[];
  }): Promise<TCreds> {
    const merged = normalizeAddresses([...credentials.contractAddresses, ...requiredContracts]);
    const signature = await this.signForContracts(credentials, merged);

    const extended = { ...credentials, contractAddresses: merged, signature } as TCreds;
    // Persist ciphertext before session signature to prevent a window where a
    // concurrent reader sees the new signature but finds old ciphertext.
    await this.persistCreds(storeKey, extended);
    await this.sessionSignatures.set(storeKey, signature, this.sessionTTL);
    this.emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: requiredContracts });
    return extended;
  }

  protected async persistCreds(storeKey: string, creds: TCreds): Promise<void> {
    await persistCredentials(this.storage, storeKey, creds, (c) => this.encryptCreds(c));
  }
}
