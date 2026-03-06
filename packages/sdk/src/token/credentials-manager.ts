import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { Address } from "../relayer/relayer-sdk.types";
import type { GenericSigner, GenericStorage, StoredCredentials } from "./token.types";
import { MemoryStorage } from "./memory-storage";
import { SigningRejectedError, SigningFailedError } from "./errors";
import { assertObject, assertString, assertArray, assertCondition } from "../utils";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";

/** Encrypted data format with IV for AES-GCM decryption. */
interface EncryptedData {
  iv: string; // Base64-encoded IV
  ciphertext: string; // Base64-encoded encrypted data
}

/** Internal storage shape — privateKey and signature are excluded; only encrypted privateKey is stored. */
interface EncryptedCredentials extends Omit<StoredCredentials, "privateKey" | "signature"> {
  encryptedPrivateKey: EncryptedData;
}

/** Structured session entry stored in session storage. */
interface SessionEntry {
  signature: string;
  /** Epoch seconds when the session was created. */
  createdAt: number;
  /** TTL at creation time (not current config). */
  ttl: number;
}

/**
 * Manages FHE decrypt credentials (keypair + EIP-712 signature).
 * Generates and refreshes credentials transparently.
 *
 * The privateKey is encrypted with AES-GCM (key derived from the
 * wallet signature via PBKDF2) before being written to the store.
 */
/** Configuration for constructing a {@link CredentialsManager}. */
export interface CredentialsManagerConfig {
  /** FHE relayer backend for keypair generation and EIP-712 creation. */
  relayer: RelayerSDK;
  /** Wallet signer for signing EIP-712 typed data. */
  signer: GenericSigner;
  /** Credential storage backend for persisting encrypted credentials. */
  storage: GenericStorage;
  /** Session storage for wallet signatures. Shared across all tokens in the same SDK instance. */
  sessionStorage: GenericStorage;
  /** How long the re-encryption keypair remains valid, in seconds. Default: `86400` (1 day) */
  keypairTTL?: number;
  /** Controls session signature lifetime in seconds. Default: `2592000` (30 days). */
  sessionTTL?: number;
  /** Optional structured event listener. */
  onEvent?: ZamaSDKEventListener;
}

export class CredentialsManager {
  #relayer: RelayerSDK;
  #signer: GenericSigner;
  #storage: GenericStorage;
  #sessionStorage: GenericStorage;
  #keypairTTL: number;
  #sessionTTL: number;
  #onEvent: ZamaSDKEventListener;
  #createPromise: Promise<StoredCredentials> | null = null;
  #createPromiseKey: string | null = null;

  static async computeStoreKey(address: string, chainId: number): Promise<string> {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${address.toLowerCase()}:${chainId}`),
    );
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, 32);
  }

  constructor(config: CredentialsManagerConfig) {
    this.#relayer = config.relayer;
    this.#signer = config.signer;
    this.#storage = config.storage;
    this.#sessionStorage = config.sessionStorage;
    this.#onEvent = config.onEvent ?? Boolean;
    this.#keypairTTL = config.keypairTTL ?? 86400;
    this.#sessionTTL = config.sessionTTL ?? 2592000;

    // Warn when using in-memory session storage inside a Chrome extension context
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const chrome = typeof globalThis !== "undefined" ? (globalThis as any).chrome : undefined;
    if (chrome?.runtime?.id && config.sessionStorage instanceof MemoryStorage) {
      console.warn(
        "[zama-sdk] Detected Chrome extension context with in-memory session storage. " +
          "Session signatures will be lost on service worker restart and won't be shared across contexts. " +
          "Consider using chromeSessionStorage instead. ",
      );
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  #emit(partial: ZamaSDKEventInput): void {
    this.#onEvent({ ...partial, timestamp: Date.now() } as never);
  }

  /**
   * Authorize FHE credentials for one or more contract addresses.
   * Returns cached credentials if still valid and covering all addresses,
   * otherwise generates a fresh keypair and requests an EIP-712 signature.
   * The wallet signature is cached in session storage.
   *
   * @example
   * ```ts
   * const creds = await credentials.allow("0xTokenAddress");
   * const creds = await credentials.allow("0xTokenA", "0xTokenB");
   * ```
   */
  async allow(...contractAddresses: Address[]): Promise<StoredCredentials> {
    const storeKey = await this.#storeKey();
    this.#emit({ type: ZamaSDKEvents.CredentialsLoading, contractAddresses });
    try {
      const stored = await this.#storage.get(storeKey);
      if (stored) {
        const encrypted = stored as unknown;
        this.#assertEncryptedCredentials(encrypted);

        const sessionEntry = await this.#getSessionEntry(storeKey);
        if (sessionEntry) {
          if (this.#isSessionExpired(sessionEntry)) {
            // Session TTL expired — clear and emit, then fall through to re-sign
            await this.#sessionStorage.delete(storeKey);
            this.#emit({ type: ZamaSDKEvents.SessionExpired, reason: "ttl" });
          } else {
            const creds = await this.#decryptCredentials(encrypted, sessionEntry.signature);
            if (this.#isValid(creds, contractAddresses)) {
              this.#emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
              this.#emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
              return creds;
            }
            this.#emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
          }
        }
        // No session signature or TTL expired — need to re-sign
        if (this.#isValidWithoutDecrypt(encrypted, contractAddresses)) {
          const signature = await this.#sign(encrypted);
          await this.#setSessionEntry(storeKey, signature);
          const creds = await this.#decryptCredentials(encrypted, signature);
          this.#emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
          this.#emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
          return creds;
        }
        this.#emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
      }
    } catch {
      try {
        await this.#storage.delete(storeKey);
      } catch {
        /* best effort */
      }
    }

    const key = contractAddresses
      .map((a) => a.toLowerCase())
      .sort()
      .join(",");
    if (!this.#createPromise || this.#createPromiseKey !== key) {
      this.#createPromiseKey = key;
      this.#createPromise = this.create(contractAddresses)
        .then((creds) => {
          this.#emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
          return creds;
        })
        .finally(() => {
          this.#createPromise = null;
          this.#createPromiseKey = null;
        });
    }
    return this.#createPromise;
  }

  /**
   * Check if stored credentials exist and are expired.
   * Returns `true` if credentials are stored but past their expiration time.
   * Returns `false` if no credentials are stored or if they are still valid.
   *
   * Use this to proactively detect expiration and show appropriate UI
   * (e.g. "Re-authorizing..." instead of a generic loading state).
   *
   * @param contractAddress - Optional contract address to check coverage for.
   *   When provided, also returns `true` if credentials don't cover this address.
   *
   * @example
   * ```ts
   * if (await credentials.isExpired("0xTokenAddress")) {
   *   showReauthorizingUI();
   * }
   * ```
   */
  async isExpired(contractAddress?: Address): Promise<boolean> {
    const storeKey = await this.#storeKey();
    try {
      const stored = await this.#storage.get(storeKey);
      if (!stored) return false;

      const encrypted = stored as unknown;
      this.#assertEncryptedCredentials(encrypted);

      const requiredContracts = contractAddress ? [contractAddress] : [];
      return !this.#isValidWithoutDecrypt(encrypted, requiredContracts);
    } catch {
      return false;
    }
  }

  /**
   * Revoke the session signature for the connected wallet. Stored credentials
   * remain intact, but the next decrypt operation will require a fresh wallet
   * signature.
   *
   * @param contractAddresses - Optional addresses included in the revoked event
   *   for observability. The session signature is always fully revoked since it
   *   is atomic over all addresses.
   *
   * @example
   * ```ts
   * await credentials.revoke();
   * await credentials.revoke("0xTokenA", "0xTokenB");
   * ```
   */
  async revoke(...contractAddresses: Address[]): Promise<void> {
    const storeKey = await this.#storeKey();
    await this.#sessionStorage.delete(storeKey);
    this.#emit({
      type: ZamaSDKEvents.CredentialsRevoked,
      ...(contractAddresses.length > 0 && { contractAddresses }),
    });
  }

  /**
   * Whether a session signature is currently cached for the connected wallet.
   */
  async isAllowed(): Promise<boolean> {
    const storeKey = await this.#storeKey();
    const entry = await this.#getSessionEntry(storeKey);
    if (entry === null) return false;
    return !this.#isSessionExpired(entry);
  }

  /**
   * Delete stored credentials for the connected wallet (best-effort).
   *
   * @example
   * ```ts
   * await credentials.clear();
   * ```
   */
  async clear(): Promise<void> {
    const storeKey = await this.#storeKey();
    await this.#sessionStorage.delete(storeKey);
    try {
      await this.#storage.delete(storeKey);
    } catch {
      // Best effort
    }
  }

  /** Returns a truncated SHA-256 hash of the address and chainId to avoid leaking it in storage. */
  async #storeKey(): Promise<string> {
    const address = (await this.#signer.getAddress()).toLowerCase();
    const chainId = await this.#signer.getChainId();
    return CredentialsManager.computeStoreKey(address, chainId);
  }

  /** Check if a session entry has expired based on its recorded TTL. */
  #isSessionExpired(entry: SessionEntry): boolean {
    if (entry.ttl === 0) return true;
    return Math.floor(Date.now() / 1000) - entry.createdAt >= entry.ttl;
  }

  async #getSessionEntry(storeKey: string): Promise<SessionEntry | null> {
    const raw = await this.#sessionStorage.get(storeKey);
    if (raw === null) return null;
    this.#assertSessionEntry(raw);
    return raw;
  }

  #assertSessionEntry(data: unknown): asserts data is SessionEntry {
    assertObject(data, "Session entry");
    assertString(data.signature, "session.signature");
    assertCondition(
      typeof data.createdAt === "number",
      `Expected session.createdAt to be a number`,
    );
    assertCondition(typeof data.ttl === "number", `Expected session.ttl to be a number`);
  }

  /** Create and store a session entry with current TTL config. */
  async #setSessionEntry(storeKey: string, signature: string): Promise<void> {
    const entry: SessionEntry = {
      signature,
      createdAt: Math.floor(Date.now() / 1000),
      ttl: this.#sessionTTL,
    };
    await this.#sessionStorage.set(storeKey, entry);
  }

  // ── Validation ──────────────────────────────────────────────

  #assertEncryptedCredentials(data: unknown): asserts data is EncryptedCredentials {
    assertObject(data, "Stored credentials");
    assertString(data.publicKey, "credentials.publicKey");
    assertArray(data.contractAddresses, "credentials.contractAddresses");
    assertObject(data.encryptedPrivateKey, "credentials.encryptedPrivateKey");
    assertString(data.encryptedPrivateKey.iv, "encryptedPrivateKey.iv");
    assertString(data.encryptedPrivateKey.ciphertext, "encryptedPrivateKey.ciphertext");
  }

  #isValid(creds: StoredCredentials, requiredContracts: Address[]): boolean {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = creds.startTimestamp + creds.durationDays * 86400;
    if (nowSeconds >= expiresAt) return false;

    const signedSet = new Set(creds.contractAddresses.map((a) => a.toLowerCase()));
    return requiredContracts.every((addr) => signedSet.has(addr.toLowerCase()));
  }

  #isValidWithoutDecrypt(encrypted: EncryptedCredentials, requiredContracts: Address[]): boolean {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = encrypted.startTimestamp + encrypted.durationDays * 86400;
    if (nowSeconds >= expiresAt) return false;
    const signedSet = new Set(encrypted.contractAddresses.map((a) => a.toLowerCase()));
    return requiredContracts.every((addr) => signedSet.has(addr.toLowerCase()));
  }

  async #sign(encrypted: EncryptedCredentials): Promise<string> {
    const eip712 = await this.#relayer.createEIP712(
      encrypted.publicKey,
      encrypted.contractAddresses,
      encrypted.startTimestamp,
      encrypted.durationDays,
    );
    return this.#signer.signTypedData(eip712);
  }

  // ── Credential generation ───────────────────────────────────

  /**
   * Generate a fresh FHE keypair, create an EIP-712 authorization, and
   * prompt the user to sign it. Persists the encrypted credentials to storage.
   *
   * @example
   * ```ts
   * const creds = await credentials.create(["0xTokenAddress"]);
   * ```
   */
  async create(contractAddresses: Address[]): Promise<StoredCredentials> {
    this.#emit({ type: ZamaSDKEvents.CredentialsCreating, contractAddresses });
    try {
      const storeKey = await this.#storeKey();
      const keypair = await this.#relayer.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);

      const durationDays = Math.ceil(this.#keypairTTL / 86400);

      const eip712 = await this.#relayer.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimestamp,
        durationDays,
      );

      const signature = await this.#signer.signTypedData(eip712);
      await this.#setSessionEntry(storeKey, signature);

      const creds: StoredCredentials = {
        publicKey: keypair.publicKey,
        privateKey: keypair.privateKey,
        signature,
        contractAddresses,
        startTimestamp,
        durationDays,
      };

      try {
        const encrypted = await this.#encryptCredentials(creds);
        await this.#storage.set(storeKey, encrypted);
      } catch {
        // Store write failed — credentials still usable in memory
      }

      this.#emit({ type: ZamaSDKEvents.CredentialsCreated, contractAddresses });
      return creds;
    } catch (error) {
      const isRejected =
        (error instanceof Error && "code" in error && error.code === 4001) ||
        (error instanceof Error &&
          (error.message.includes("rejected") || error.message.includes("denied")));
      if (isRejected) {
        throw new SigningRejectedError("User rejected the decrypt authorization signature", {
          cause: error,
        });
      }
      throw new SigningFailedError("Failed to create decrypt credentials", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // ── AES-GCM encryption  ─────────────

  async #encryptCredentials(creds: StoredCredentials): Promise<EncryptedCredentials> {
    const address = (await this.#signer.getAddress()).toLowerCase();
    const encryptedPrivateKey = await this.#encrypt(creds.privateKey, creds.signature, address);
    const { privateKey: _, signature: _sig, ...rest } = creds;
    return { ...rest, encryptedPrivateKey };
  }

  async #decryptCredentials(
    encrypted: EncryptedCredentials,
    signature: string,
  ): Promise<StoredCredentials> {
    const address = (await this.#signer.getAddress()).toLowerCase();
    const privateKey = await this.#decrypt(encrypted.encryptedPrivateKey, signature, address);
    const { encryptedPrivateKey: _, ...rest } = encrypted;
    return { ...rest, privateKey, signature };
  }

  /**
   * Derives an AES-GCM encryption key from a wallet signature using PBKDF2.
   * The signature is a secret known only to the wallet holder, providing
   * meaningful encryption protection for the stored private key.
   */
  async #deriveKey(signature: string, address: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signature),
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode(address),
        iterations: 600_000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  /** Encrypts a string using AES-GCM with a key derived from the wallet signature. */
  async #encrypt(plaintext: string, signature: string, address: string): Promise<EncryptedData> {
    const key = await this.#deriveKey(signature, address);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext),
    );

    return {
      iv: btoa(String.fromCharCode(...iv)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    };
  }

  /** Decrypts AES-GCM encrypted data using a key derived from the wallet signature. */
  async #decrypt(encrypted: EncryptedData, signature: string, address: string): Promise<string> {
    const key = await this.#deriveKey(signature, address);
    const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));

    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

    return new TextDecoder().decode(plaintext);
  }
}
