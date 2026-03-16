import type { RelayerSDK } from "../relayer/relayer-sdk";

import type { GenericSigner, GenericStorage, StoredCredentials } from "./token.types";
import { MemoryStorage } from "./memory-storage";
import { SigningRejectedError, SigningFailedError } from "./errors";
import { assertObject, assertString, assertArray, assertCondition, prefixHex } from "../utils";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import { getAddress, isAddress, type Address, type Hex } from "viem";

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
  signature: Hex;
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

function hasExtensionRuntimeId(value: unknown): value is { runtime: { id: string } } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const runtime = Reflect.get(value, "runtime");
  if (typeof runtime !== "object" || runtime === null) {
    return false;
  }
  return typeof Reflect.get(runtime, "id") === "string";
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
  #extendPromise: Promise<StoredCredentials> | null = null;
  #cachedStoreKey: string | null = null;
  #cachedStoreKeyIdentity: string | null = null;
  #cachedDerivedKey: CryptoKey | null = null;
  #cachedDerivedKeyIdentity: string | null = null;

  static async computeStoreKey(address: Address, chainId: number): Promise<string> {
    const normalizedAddress = getAddress(address);
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${normalizedAddress}:${chainId}`),
    );
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const chromeNamespace =
      typeof globalThis !== "undefined" ? Reflect.get(globalThis, "chrome") : undefined;
    if (hasExtensionRuntimeId(chromeNamespace) && config.sessionStorage instanceof MemoryStorage) {
      console.warn(
        "[zama-sdk] Detected Chrome extension context with in-memory session storage. " +
          "Session signatures will be lost on service worker restart and won't be shared across contexts. " +
          "Consider using chromeSessionStorage instead. ",
      );
    }
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
    contractAddresses = [
      ...new Set(contractAddresses.map((address) => getAddress(address))),
    ].toSorted();
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
            // Keypair still time-valid but missing contracts — extend and re-sign
            if (this.#isTimeValid(creds)) {
              return this.#extendContracts({
                storeKey,
                credentials: creds,
                requiredContracts: contractAddresses,
              });
            }
            this.#emit({ type: ZamaSDKEvents.CredentialsExpired, contractAddresses });
          }
        }
        // No session signature or TTL expired — need to re-sign
        if (this.#isTimeValid(encrypted)) {
          if (this.#coversContracts(encrypted.contractAddresses, contractAddresses)) {
            const signature = await this.#sign(encrypted);
            await this.#setSessionEntry(storeKey, signature);
            const creds = await this.#decryptCredentials(encrypted, signature);
            this.#emit({ type: ZamaSDKEvents.CredentialsCached, contractAddresses });
            this.#emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses });
            return creds;
          }
          // Time-valid but missing contracts and no session — sign with old addresses to decrypt, then extend
          const oldSignature = await this.#sign(encrypted);
          const creds = await this.#decryptCredentials(encrypted, oldSignature);
          return this.#extendContracts({
            storeKey,
            credentials: creds,
            requiredContracts: contractAddresses,
          });
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

    const key = contractAddresses.join(",");
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
      if (!stored) {
        return false;
      }

      const encrypted = stored as unknown;
      this.#assertEncryptedCredentials(encrypted);

      const requiredContracts = contractAddress ? [contractAddress] : [];
      return !this.#isValid(encrypted, requiredContracts);
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
    this.#clearCryptoCache();
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
    if (entry === null) {
      return false;
    }
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
    this.#clearCryptoCache();
    try {
      await this.#storage.delete(storeKey);
    } catch {
      // Best effort
    }
  }

  /** Clear cached cryptographic material (store key, derived key). */
  #clearCryptoCache(): void {
    this.#cachedStoreKey = null;
    this.#cachedStoreKeyIdentity = null;
    this.#cachedDerivedKey = null;
    this.#cachedDerivedKeyIdentity = null;
  }

  /** Returns a truncated SHA-256 hash of the address and chainId to avoid leaking it in storage. */
  async #storeKey(): Promise<string> {
    const address = await this.#signer.getAddress();
    const chainId = await this.#signer.getChainId();
    const identity = `${getAddress(address)}:${chainId}`;
    if (this.#cachedStoreKey && this.#cachedStoreKeyIdentity === identity) {
      return this.#cachedStoreKey;
    }
    const key = await CredentialsManager.computeStoreKey(address, chainId);
    this.#cachedStoreKeyIdentity = identity;
    this.#cachedStoreKey = key;
    return key;
  }

  /** Check if a session entry has expired based on its recorded TTL. */
  #isSessionExpired(entry: SessionEntry): boolean {
    if (entry.ttl === 0) {
      return true;
    }
    return Math.floor(Date.now() / 1000) - entry.createdAt >= entry.ttl;
  }

  async #getSessionEntry(storeKey: string): Promise<SessionEntry | null> {
    const raw = await this.#sessionStorage.get(storeKey);
    if (raw === null) {
      return null;
    }
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
  async #setSessionEntry(storeKey: string, signature: Hex): Promise<void> {
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
    for (const addr of data.contractAddresses) {
      assertCondition(
        typeof addr === "string" && isAddress(addr, { strict: false }),
        `Expected each contractAddress to be a valid hex address`,
      );
    }
    assertObject(data.encryptedPrivateKey, "credentials.encryptedPrivateKey");
    assertString(data.encryptedPrivateKey.iv, "encryptedPrivateKey.iv");
    assertString(data.encryptedPrivateKey.ciphertext, "encryptedPrivateKey.ciphertext");
  }

  #isValid(
    creds: { startTimestamp: number; durationDays: number; contractAddresses: Address[] },
    requiredContracts: Address[],
  ): boolean {
    if (!this.#isTimeValid(creds)) {
      return false;
    }
    return this.#coversContracts(creds.contractAddresses, requiredContracts);
  }

  /** Check if credentials are still within their keypair TTL. */
  #isTimeValid(creds: { startTimestamp: number; durationDays: number }): boolean {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = creds.startTimestamp + creds.durationDays * 86400;
    return nowSeconds < expiresAt;
  }

  /** Check if the signed address set covers all required addresses. */
  #coversContracts(signedAddresses: Address[], requiredContracts: Address[]): boolean {
    const required = new Set(requiredContracts.map((address) => getAddress(address)));
    return required.isSubsetOf(new Set(signedAddresses.map((address) => getAddress(address))));
  }

  async #sign(encrypted: EncryptedCredentials): Promise<Hex> {
    return this.#signWithContracts(encrypted, encrypted.contractAddresses);
  }

  /** Sign an EIP-712 authorization for the given contract addresses using the stored keypair metadata. */
  async #signWithContracts(
    keypairMeta: { publicKey: Hex; startTimestamp: number; durationDays: number },
    contractAddresses: Address[],
  ): Promise<Hex> {
    const eip712 = await this.#relayer.createEIP712(
      keypairMeta.publicKey,
      contractAddresses,
      keypairMeta.startTimestamp,
      keypairMeta.durationDays,
    );
    return this.#signer.signTypedData(eip712);
  }

  /** Merge two contract address lists into a deduplicated sorted array. */
  #mergeContracts(existing: Address[], incoming: Address[]): Address[] {
    return [
      ...new Set([...existing, ...incoming].map((address) => getAddress(address))),
    ].toSorted();
  }

  /**
   * Extend credentials with additional contract addresses: re-sign with the
   * merged set and persist, reusing the existing keypair.
   *
   * Serialized via `#extendPromise` so that concurrent `allow()` calls with
   * different addresses don't race on read-modify-write of the contract list.
   */
  async #extendContracts({
    storeKey,
    credentials,
    requiredContracts,
  }: {
    storeKey: string;
    credentials: StoredCredentials;
    requiredContracts: Address[];
  }): Promise<StoredCredentials> {
    // Serialize concurrent extensions to prevent last-write-wins races.
    if (this.#extendPromise) {
      const previous = await this.#extendPromise;
      // Previous extension may already cover our required contracts.
      if (this.#coversContracts(previous.contractAddresses, requiredContracts)) {
        this.#emit({
          type: ZamaSDKEvents.CredentialsAllowed,
          contractAddresses: requiredContracts,
        });
        return previous;
      }
      // Use the latest state as our base so we don't drop its addresses.
      credentials = previous;
    }

    const promise = this.#performExtend({ storeKey, credentials, requiredContracts });
    this.#extendPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.#extendPromise === promise) {
        this.#extendPromise = null;
      }
    }
  }

  async #performExtend({
    storeKey,
    credentials,
    requiredContracts,
  }: {
    storeKey: string;
    credentials: StoredCredentials;
    requiredContracts: Address[];
  }): Promise<StoredCredentials> {
    const merged = this.#mergeContracts(credentials.contractAddresses, requiredContracts);
    const signature = await this.#signWithContracts(credentials, merged);

    const extended: StoredCredentials = {
      ...credentials,
      contractAddresses: merged,
      signature,
    };
    // Persist ciphertext before updating the session signature to prevent a
    // window where a concurrent reader sees the new signature but finds
    // ciphertext encrypted with the old one, fails decrypt, and regenerates.
    await this.#persistCredentials(storeKey, extended);
    await this.#setSessionEntry(storeKey, signature);
    this.#emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: requiredContracts });
    return extended;
  }

  /** Re-encrypt and persist credentials (best-effort — failures are swallowed). */
  async #persistCredentials(storeKey: string, creds: StoredCredentials): Promise<void> {
    try {
      const encrypted = await this.#encryptCredentials(creds);
      await this.#storage.set(storeKey, encrypted);
    } catch {
      // Store write failed — credentials still usable in memory
    }
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
    contractAddresses = [
      ...new Set(contractAddresses.map((address) => getAddress(address))),
    ].toSorted();
    this.#emit({ type: ZamaSDKEvents.CredentialsCreating, contractAddresses });
    try {
      const storeKey = await this.#storeKey();
      const keypair = await this.#relayer.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);

      const durationDays = Math.ceil(this.#keypairTTL / 86400);

      const publicKey = keypair.publicKey;
      const privateKey = keypair.privateKey;

      const eip712 = await this.#relayer.createEIP712(
        publicKey,
        contractAddresses,
        startTimestamp,
        durationDays,
      );

      const signature = await this.#signer.signTypedData(eip712);

      const creds: StoredCredentials = {
        publicKey,
        privateKey,
        signature,
        contractAddresses,
        startTimestamp,
        durationDays,
      };

      // Persist ciphertext before session signature (same rationale as #performExtend).
      await this.#persistCredentials(storeKey, creds);
      await this.#setSessionEntry(storeKey, signature);

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
    const address = await this.#signer.getAddress();
    const encryptedPrivateKey = await this.#encrypt(creds.privateKey, creds.signature, address);
    const { privateKey: _, signature: _sig, ...rest } = creds;
    return { ...rest, encryptedPrivateKey };
  }

  async #decryptCredentials(
    encrypted: EncryptedCredentials,
    signature: Hex,
  ): Promise<StoredCredentials> {
    const address = await this.#signer.getAddress();
    const privateKey = await this.#decrypt(encrypted.encryptedPrivateKey, signature, address);
    const { encryptedPrivateKey: _, ...rest } = encrypted;
    return { ...rest, privateKey, signature };
  }

  /**
   * Derives an AES-GCM encryption key from a wallet signature using PBKDF2.
   * The signature is a secret known only to the wallet holder, providing
   * meaningful encryption protection for the stored private key.
   */
  async #deriveKey(signature: Hex, address: Address): Promise<CryptoKey> {
    const identity = `${signature}:${address}`;
    if (this.#cachedDerivedKey && this.#cachedDerivedKeyIdentity === identity) {
      return this.#cachedDerivedKey;
    }

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signature),
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    const key = await crypto.subtle.deriveKey(
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

    this.#cachedDerivedKeyIdentity = identity;
    this.#cachedDerivedKey = key;
    return key;
  }

  /** Encrypts a string using AES-GCM with a key derived from the wallet signature. */
  async #encrypt(plaintext: Hex, signature: Hex, address: Address): Promise<EncryptedData> {
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
  async #decrypt(encrypted: EncryptedData, signature: Hex, address: Address): Promise<Hex> {
    const key = await this.#deriveKey(signature, address);
    const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));

    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

    return prefixHex(new TextDecoder().decode(plaintext));
  }
}
