import { getAddress, type Address, type Hex } from "viem";
import { ZamaError } from "../errors/base";
import { PartialCredentialError } from "../errors/partial-credential";
import { wrapSigningError } from "../errors/signing";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { GenericSigner, GenericStorage, StoredCredentials } from "../types";
import { toError } from "../utils/error";
import { CredentialCrypto } from "./credential-crypto";
import { CredentialSetImpl, type CredentialSet } from "./credential-set";
import type { BaseEncryptedCredentials } from "./credential-validation";
import {
  MAX_CONTRACTS_PER_CREDENTIAL,
  chunkAddresses,
  coversContracts,
  isCredentialValid,
  isTimeValid,
  normalizeAddresses,
} from "./credential-validation";
import { SessionSignatures } from "./session-signatures";

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
  /** FHE keypair lifetime in seconds. Defaults to `2592000` (30 days). */
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
  readonly keypairTTL: number;
  readonly sessionTTL: number | "infinite";

  #onEvent: ZamaSDKEventListener;
  #createPromise: Promise<TCreds> | null = null;
  #createPromiseKey: string | null = null;
  #extendPromise: Promise<TCreds> | null = null;
  /** Last successfully resolved extension result, used to recover from the race where a
   * concurrent call enters #extendContracts after #extendPromise was already cleared. */
  #lastExtendResult: TCreds | null = null;

  constructor(config: CredentialsConfig) {
    this.signer = config.signer;
    this.storage = config.storage;
    this.sessionSignatures = new SessionSignatures(config.sessionStorage);
    this.crypto = new CredentialCrypto();
    this.keypairTTL = config.keypairTTL ?? 2592000;
    this.sessionTTL = config.sessionTTL ?? 2592000;
    this.#onEvent = config.onEvent ?? (() => {});

    if (typeof this.keypairTTL === "number" && this.keypairTTL < 0) {
      throw new Error("keypairTTL must be >= 0");
    }
    if (typeof this.sessionTTL === "number" && this.sessionTTL < 0) {
      throw new Error("sessionTTL must be >= 0");
    }
    if (typeof this.sessionTTL === "number" && this.sessionTTL > this.keypairTTL) {
      this.sessionTTL = this.keypairTTL;
      // oxlint-disable-next-line no-console
      console.warn(
        `[zama-sdk] sessionTTL was clamped to keypairTTL (${this.keypairTTL}s). ` +
          "A session that outlives the keypair causes isAllowed() to return true " +
          "after the keypair expires, leading to unexpected wallet prompts.",
      );
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
    this.emit({
      type: ZamaSDKEvents.CredentialsLoading,
      contractAddresses: contracts,
    });

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
              this.emit({
                type: ZamaSDKEvents.CredentialsCached,
                contractAddresses: contracts,
              });
              this.emit({
                type: ZamaSDKEvents.CredentialsAllowed,
                contractAddresses: contracts,
              });
              return creds;
            }
            if (isTimeValid(creds)) {
              return this.#extendContracts({
                key,
                credentials: creds,
                requiredContracts: contracts,
              });
            }
            this.emit({
              type: ZamaSDKEvents.CredentialsExpired,
              contractAddresses: contracts,
            });
          }
        }

        // No session or expired — need to re-sign
        if (isTimeValid(encrypted)) {
          if (coversContracts(encrypted.contractAddresses, contracts)) {
            const signature = await this.signForContracts(encrypted, encrypted.contractAddresses);
            await this.sessionSignatures.set({
              key,
              signature,
              ttl: this.sessionTTL,
            });
            const creds = await this.decryptCredentials(encrypted, signature);
            this.emit({
              type: ZamaSDKEvents.CredentialsCached,
              contractAddresses: contracts,
            });
            this.emit({
              type: ZamaSDKEvents.CredentialsAllowed,
              contractAddresses: contracts,
            });
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

        this.emit({
          type: ZamaSDKEvents.CredentialsExpired,
          contractAddresses: contracts,
        });
      }
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      // oxlint-disable-next-line no-console
      console.warn("[zama-sdk] Credential resolution failed, recreating:", error);
      this.emit({
        type: ZamaSDKEvents.CredentialsCorrupted,
        error: toError(error),
      });
      await this.#deleteCredentials(key);
    }

    // Nothing cached — create fresh (deduplicated)
    if (!this.#createPromise || this.#createPromiseKey !== createKey) {
      this.#createPromiseKey = createKey;
      this.#createPromise = createFn()
        .then((creds) => {
          this.emit({
            type: ZamaSDKEvents.CredentialsAllowed,
            contractAddresses: contracts,
          });
          return creds;
        })
        .finally(() => {
          this.#createPromise = null;
          this.#createPromiseKey = null;
        });
    }
    return this.#createPromise;
  }

  // ── Multi-batch credential resolution ─────────────────────────

  /**
   * Resolve credentials for a set of contract addresses, assigning each to an
   * existing or new batch (bin-packing). Fails fast: if any batch's signing is
   * rejected the error propagates immediately, leaving previously-signed batches
   * in storage for efficient retry.
   *
   * Called once per Batcher slice from the subclass `allow()` implementations.
   *
   * @param key       - Base storage key for this (wallet, chain) identity.
   * @param contracts - All contract addresses that need to be covered.
   * @param createFn  - Factory called for each new batch; receives the batch's
   *   address slice and should generate (or reuse) a keypair + EIP-712 signature.
   */
  protected async resolveMulti({
    key,
    contracts,
    createFn,
  }: {
    key: string;
    contracts: Address[];
    createFn: (batchAddresses: Address[], batchKey: string) => Promise<TCreds>;
  }): Promise<CredentialSet<TCreds>> {
    if (contracts.length === 0) {
      return new CredentialSetImpl<TCreds>([]);
    }

    // 1. Load existing batch metadata (address lists, no decryption needed yet).
    const {
      batches: existingBatches,
      highestIndex,
      corruptedIndex,
    } = await this.#scanBatchMeta(key);

    // 2. Bin-pack: assign each required address to an existing or new batch.
    //    If a corrupted slot was found, reuse it (resolveCredentials will clean it up).
    const nextBatchIndex = corruptedIndex !== null ? corruptedIndex : highestIndex + 1;
    const assignments = this.#computeBatchAssignments(
      existingBatches,
      contracts,
      key,
      nextBatchIndex,
    );

    // 3. Resolve each batch in sequence (preserves single-prompt-at-a-time UX).
    //    On failure, wrap with PartialCredentialError when at least one batch
    //    already succeeded so callers can use and inspect the partial result.
    const results: Array<{ addresses: Address[]; result: TCreds }> = [];
    for (const { batchKey, addresses } of assignments) {
      const normalizedAddresses = normalizeAddresses(addresses);
      try {
        const creds = await this.resolveCredentials({
          key: batchKey,
          contracts: normalizedAddresses,
          createKey: `${batchKey}:${normalizedAddresses.join(",")}`,
          createFn: () => createFn(normalizedAddresses, batchKey),
        });
        results.push({ addresses: normalizedAddresses, result: creds });
      } catch (error) {
        if (results.length > 0) {
          throw new PartialCredentialError(new CredentialSetImpl(results), toError(error));
        }
        throw error;
      }
    }

    return new CredentialSetImpl<TCreds>(results);
  }

  /** Assign required addresses to existing batches (bin-packing) and overflow into new ones. */
  #computeBatchAssignments(
    existingBatches: Array<{ batchKey: string; addresses: Address[] }>,
    required: Address[],
    baseKey: string,
    nextBatchIndex: number,
  ): Array<{ batchKey: string; addresses: Address[] }> {
    // Mutable copy — we may extend existing batches with new addresses.
    const assignments: Array<{ batchKey: string; addresses: Address[] }> = existingBatches.map(
      (b) => ({ batchKey: b.batchKey, addresses: [...b.addresses] }),
    );

    const covered = new Set<Address>(
      existingBatches.flatMap((b) => b.addresses).map((a) => getAddress(a)),
    );

    // Identify new addresses not yet covered by any batch.
    const newAddresses = required.map((a) => getAddress(a)).filter((a) => !covered.has(a));

    // Bin-packing: fill existing batches with spare capacity first.
    const overflow: Address[] = [];
    for (const addr of newAddresses) {
      let packed = false;
      for (const batch of assignments) {
        if (batch.addresses.length < MAX_CONTRACTS_PER_CREDENTIAL) {
          batch.addresses.push(addr);
          packed = true;
          break;
        }
      }
      if (!packed) {
        overflow.push(addr);
      }
    }

    // Create new batches for addresses that didn't fit.
    const newBatches = chunkAddresses(overflow, MAX_CONTRACTS_PER_CREDENTIAL);
    for (let i = 0; i < newBatches.length; i++) {
      const batchIndex = nextBatchIndex + i;
      assignments.push({
        batchKey: batchIndex === 0 ? baseKey : `${baseKey}:${batchIndex}`,
        addresses: newBatches[i] ?? [],
      });
    }

    return assignments;
  }

  /**
   * Scan storage for all valid credential batches under `key`.
   * Returns valid batches with their address lists, the highest slot index seen,
   * and the index of the first corrupted slot (if any) so callers can reuse that
   * slot for recovery.
   *
   * Batch 0 uses `key`; subsequent batches use `key:1`, `key:2`, …
   * Stops at the first completely absent slot or the first corrupted entry.
   */
  async #scanBatchMeta(key: string): Promise<{
    batches: Array<{ batchKey: string; addresses: Address[] }>;
    highestIndex: number;
    corruptedIndex: number | null;
  }> {
    const batches: Array<{ batchKey: string; addresses: Address[] }> = [];
    let highestIndex = -1;
    for (let i = 0; ; i++) {
      const k = i === 0 ? key : `${key}:${i}`;
      const stored = await this.storage.get(k);
      if (!stored) {
        break;
      }
      highestIndex = i;
      try {
        this.assertEncrypted(stored as TEncrypted);
        batches.push({ batchKey: k, addresses: (stored as TEncrypted).contractAddresses });
      } catch (error) {
        // Corrupted entry — stop scanning; caller can reuse this slot for recovery.
        // oxlint-disable-next-line no-console
        console.warn(
          `[zama-sdk] Corrupted credential batch at key "${k}", treating as recoverable:`,
          error,
        );
        return { batches, highestIndex, corruptedIndex: i };
      }
    }
    return { batches, highestIndex, corruptedIndex: null };
  }

  /**
   * Return all storage keys for existing batches under `key`, including tombstone
   * slots from previous partial failures. Used by `clearAll` and `revokeSession`
   * to ensure orphaned entries are cleaned up.
   * Falls back to `[key]` when no entries are stored at all.
   */
  async #scanBatchKeys(key: string): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; ; i++) {
      const k = i === 0 ? key : `${key}:${i}`;
      const stored = await this.storage.get(k);
      if (!stored) {
        break;
      }
      keys.push(k);
    }
    return keys.length > 0 ? keys : [key];
  }

  // ── Shared public method implementations ──────────────────────

  /**
   * Check whether stored credentials are expired or don't cover the given contract.
   * Returns `true` if stored credentials are expired or corrupted.
   * Returns `false` if no credentials exist yet.
   * With multiple batches, returns `false` if any valid batch covers `contractAddress`.
   */
  protected async checkExpired(key: string, contractAddress?: Address): Promise<boolean> {
    try {
      const { batches, highestIndex, corruptedIndex } = await this.#scanBatchMeta(key);

      if (batches.length === 0) {
        if (corruptedIndex !== null || highestIndex >= 0) {
          // Slots exist but all were tombstones or corrupted — treat as expired.
          return true;
        }
        // No stored credentials at all — not expired, just absent.
        return false;
      }

      if (batches.length === 1) {
        // Fast path: single batch.
        const firstBatch = batches[0];
        if (!firstBatch) {
          return false;
        }
        const stored = await this.storage.get<TEncrypted>(firstBatch.batchKey);
        if (!stored) {
          return false;
        }
        this.assertEncrypted(stored);
        const requiredContracts = contractAddress ? [contractAddress] : [];
        return !isCredentialValid(stored, requiredContracts);
      }

      // Multi-batch: check each batch for validity.
      const results = await Promise.all(
        batches.map(async ({ batchKey }) => {
          const stored = await this.storage.get<TEncrypted>(batchKey);
          if (!stored) {
            return false;
          }
          try {
            this.assertEncrypted(stored);
            const required = contractAddress ? [contractAddress] : [];
            return isCredentialValid(stored, required);
          } catch (error) {
            // oxlint-disable-next-line no-console
            console.warn(
              "[zama-sdk] Credential batch validation failed, treating as expired:",
              error,
            );
            return false;
          }
        }),
      );

      if (contractAddress) {
        // Expired for this address if no valid batch covers it.
        return !results.some(Boolean);
      }
      // Expired overall if any batch is expired (conservative).
      return !results.every(Boolean);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn("[zama-sdk] isExpired check failed, treating as expired:", error);
      return true;
    }
  }

  /**
   * Delete session signatures for `key`.
   *
   * With no contract addresses, all batch sessions are deleted. With explicit
   * contract addresses, only batches covering at least one requested contract
   * are revoked.
   */
  protected async revokeSession(key: string, contractAddresses?: Address[]): Promise<void> {
    let batchKeys: string[];
    if (!contractAddresses || contractAddresses.length === 0) {
      batchKeys = await this.#scanBatchKeys(key);
    } else {
      const requested = new Set(contractAddresses.map((address) => getAddress(address)));
      const { batches } = await this.#scanBatchMeta(key);
      batchKeys = batches
        .filter(({ addresses }) => addresses.some((address) => requested.has(getAddress(address))))
        .map(({ batchKey }) => batchKey);
    }

    await Promise.all(batchKeys.map((batchKey) => this.sessionSignatures.delete(batchKey)));
    this.clearCaches();
    this.emit({
      type: ZamaSDKEvents.CredentialsRevoked,
      ...(contractAddresses ? { contractAddresses } : {}),
    } as ZamaSDKEventInput);
  }

  protected async checkAllowed(
    key: string,
    contractAddresses: [Address, ...Address[]],
  ): Promise<boolean> {
    // Runtime guard: credentials are always contract-scoped,
    // so an empty contract list must never resolve to "allowed"
    // (the compile-time tuple type can be bypassed via casts).
    if (contractAddresses.length === 0) {
      return false;
    }
    try {
      const { batches } = await this.#scanBatchMeta(key);
      if (batches.length === 0) {
        return false;
      }

      const uncovered = new Set(contractAddresses.map((address) => getAddress(address)));

      for (const { batchKey } of batches) {
        const entry = await this.sessionSignatures.get(batchKey);
        if (entry === null || this.sessionSignatures.isExpired(entry)) {
          continue;
        }

        const stored = await this.storage.get<TEncrypted>(batchKey);
        if (!stored) {
          continue;
        }

        try {
          this.assertEncrypted(stored);
          const coveredInBatch: Address[] = [];
          for (const contractAddress of uncovered) {
            if (isCredentialValid(stored, [contractAddress])) {
              coveredInBatch.push(contractAddress);
            }
          }
          for (const contractAddress of coveredInBatch) {
            uncovered.delete(contractAddress);
          }
          if (uncovered.size === 0) {
            return true;
          }
        } catch (error) {
          // oxlint-disable-next-line no-console
          console.warn(
            "[zama-sdk] Credential batch validation failed, treating as not allowed:",
            error,
          );
          continue;
        }
      }

      return false;
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn("[zama-sdk] isAllowed check failed, treating as not allowed:", error);
      return false;
    }
  }

  /** Delete all batch credentials and their session signatures. */
  protected async clearAll(key: string): Promise<void> {
    const batchKeys = await this.#scanBatchKeys(key);
    await Promise.all([
      ...batchKeys.map((k) => this.sessionSignatures.delete(k)),
      ...batchKeys.map((k) => this.#deleteCredentials(k)),
    ]);
    this.clearCaches();
  }

  /** Override to also clear subclass-specific caches (e.g. key cache). */
  protected clearCaches(): void {
    this.crypto.clearCache();
    this.#lastExtendResult = null;
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
      if (error instanceof ZamaError) {
        throw error;
      }
      return wrapSigningError(error, errorContext);
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
        this.emit({
          type: ZamaSDKEvents.CredentialsAllowed,
          contractAddresses: requiredContracts,
        });
        return previous;
      }
      credentials = previous;
    } else if (this.#lastExtendResult) {
      // A concurrent extension may have resolved and cleared #extendPromise before
      // this call entered. Use the last known result as the base to avoid dropping
      // contract addresses merged by the just-completed extension.
      const last = this.#lastExtendResult;
      if (coversContracts(last.contractAddresses, requiredContracts)) {
        this.emit({
          type: ZamaSDKEvents.CredentialsAllowed,
          contractAddresses: requiredContracts,
        });
        return last;
      }
      credentials = last;
    }

    const promise = this.#extendCredentials({
      key,
      credentials,
      requiredContracts,
    });
    this.#extendPromise = promise;
    try {
      const result = await promise;
      this.#lastExtendResult = result;
      return result;
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

    const extended: TCreds = {
      ...credentials,
      contractAddresses: merged,
      signature,
    };
    // Persist ciphertext before session signature to prevent a window where a
    // concurrent reader sees the new signature but finds old ciphertext.
    await this.persistCredentials(key, extended);
    await this.sessionSignatures.set({
      key,
      signature,
      ttl: this.sessionTTL,
    });
    this.emit({
      type: ZamaSDKEvents.CredentialsAllowed,
      contractAddresses: requiredContracts,
    });
    return extended;
  }

  protected async persistCredentials(key: string, credentials: TCreds): Promise<void> {
    try {
      const encrypted = await this.encryptCredentials(credentials);
      await this.storage.set(key, encrypted);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn("[zama-sdk] Failed to encrypt credentials for persistence:", error);
      this.emit({
        type: ZamaSDKEvents.CredentialsPersistFailed,
        error: toError(error),
      });
    }
  }

  async #deleteCredentials(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn("[zama-sdk] Failed to delete credentials:", error);
      this.emit({
        type: ZamaSDKEvents.CredentialsPersistFailed,
        error: toError(error),
      });
    }
  }
}
