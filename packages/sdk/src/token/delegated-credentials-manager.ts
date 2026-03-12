import type { RelayerSDK } from "../relayer/relayer-sdk";

import { getAddress, isAddress, type Address, type Hex } from "viem";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import { assertArray, assertCondition, assertObject, assertString, prefixHex } from "../utils";
import { SigningFailedError, SigningRejectedError } from "./errors";
import type { DelegatedStoredCredentials, GenericSigner, GenericStorage } from "./token.types";

/** Encrypted data format with IV for AES-GCM decryption. */
interface EncryptedData {
  iv: string; // Base64-encoded IV
  ciphertext: string; // Base64-encoded encrypted data
}

/** Internal storage shape — privateKey and signature are excluded; only encrypted privateKey is stored. */
interface EncryptedCredentials extends Omit<
  DelegatedStoredCredentials,
  "privateKey" | "signature"
> {
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

/** Configuration for constructing a {@link DelegatedCredentialsManager}. */
export interface DelegatedCredentialsManagerConfig {
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
  /** Controls session signature lifetime in seconds. Default: `2592000` (30 days). `0` means never expire. */
  sessionTTL?: number;
  /** Optional structured event listener. */
  onEvent?: ZamaSDKEventListener;
}

/**
 * Manages FHE decrypt credentials for delegated decryption.
 * Mirrors {@link CredentialsManager} but scoped to a (delegate, delegator) pair
 * and uses `createDelegatedUserDecryptEIP712` / `delegatedUserDecrypt`.
 *
 * The privateKey is encrypted with AES-GCM (key derived from the
 * wallet signature via PBKDF2) before being written to the store.
 */
export class DelegatedCredentialsManager {
  #relayer: RelayerSDK;
  #signer: GenericSigner;
  #storage: GenericStorage;
  #sessionStorage: GenericStorage;
  #keypairTTL: number;
  #sessionTTL: number;
  #onEvent: ZamaSDKEventListener;
  #createPromise: Promise<DelegatedStoredCredentials> | null = null;
  #createPromiseKey: string | null = null;
  #extendPromise: Promise<DelegatedStoredCredentials> | null = null;
  #cachedDerivedKey: CryptoKey | null = null;
  #cachedDerivedKeyIdentity: string | null = null;

  static async computeStoreKey(
    delegateAddress: Address,
    delegatorAddress: Address,
    chainId: number,
  ): Promise<string> {
    const normalizedDelegate = getAddress(delegateAddress);
    const normalizedDelegator = getAddress(delegatorAddress);
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${normalizedDelegate}:${normalizedDelegator}:${chainId}`),
    );
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, 32);
  }

  constructor(config: DelegatedCredentialsManagerConfig) {
    this.#relayer = config.relayer;
    this.#signer = config.signer;
    this.#storage = config.storage;
    this.#sessionStorage = config.sessionStorage;
    this.#onEvent = config.onEvent ?? Boolean;
    this.#keypairTTL = config.keypairTTL ?? 86400;
    this.#sessionTTL = config.sessionTTL ?? 2592000;
  }

  #emit(partial: ZamaSDKEventInput): void {
    this.#onEvent({ ...partial, timestamp: Date.now() } as never);
  }

  #normalizeAddresses(addresses: Address[]) {
    return [...new Set(addresses.map((address) => getAddress(address)))].sort();
  }

  /**
   * Authorize FHE delegated credentials for one or more contract addresses.
   * Returns cached credentials if still valid and covering all addresses,
   * otherwise generates a fresh keypair and requests an EIP-712 signature.
   */
  async allow(
    delegatorAddress: Address,
    ...contractAddresses: Address[]
  ): Promise<DelegatedStoredCredentials> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedContractAddresses = this.#normalizeAddresses(contractAddresses);
    const storeKey = await this.#storeKey(normalizedDelegator);

    this.#emit({
      type: ZamaSDKEvents.CredentialsLoading,
      contractAddresses: normalizedContractAddresses,
    });
    try {
      const encrypted = await this.#storage.get<EncryptedCredentials>(storeKey);
      if (encrypted) {
        this.#assertEncryptedCredentials(encrypted);

        const sessionEntry = await this.#getSessionEntry(storeKey);
        if (sessionEntry) {
          if (this.#isSessionExpired(sessionEntry)) {
            await this.#sessionStorage.delete(storeKey);
            this.#emit({ type: ZamaSDKEvents.SessionExpired, reason: "ttl" });
          } else {
            const creds = await this.#decryptCredentials(encrypted, sessionEntry.signature);
            if (this.#isValid(creds, normalizedContractAddresses)) {
              this.#emit({
                type: ZamaSDKEvents.CredentialsCached,
                contractAddresses: normalizedContractAddresses,
              });
              this.#emit({
                type: ZamaSDKEvents.CredentialsAllowed,
                contractAddresses: normalizedContractAddresses,
              });
              return creds;
            }
            if (this.#isTimeValid(creds)) {
              return this.#extendContracts({
                storeKey,
                credentials: creds,
                requiredContracts: normalizedContractAddresses,
              });
            }
            this.#emit({
              type: ZamaSDKEvents.CredentialsExpired,
              contractAddresses: normalizedContractAddresses,
            });
          }
        }
        // No session signature or TTL expired — need to re-sign
        if (this.#isTimeValid(encrypted)) {
          if (this.#coversContracts(encrypted.contractAddresses, normalizedContractAddresses)) {
            const signature = await this.#sign(encrypted);
            await this.#setSessionEntry(storeKey, signature);
            const creds = await this.#decryptCredentials(encrypted, signature);
            this.#emit({
              type: ZamaSDKEvents.CredentialsCached,
              contractAddresses: normalizedContractAddresses,
            });
            this.#emit({
              type: ZamaSDKEvents.CredentialsAllowed,
              contractAddresses: normalizedContractAddresses,
            });
            return creds;
          }
          const oldSignature = await this.#sign(encrypted);
          const creds = await this.#decryptCredentials(encrypted, oldSignature);
          return this.#extendContracts({
            storeKey,
            credentials: creds,
            requiredContracts: normalizedContractAddresses,
          });
        }
        this.#emit({
          type: ZamaSDKEvents.CredentialsExpired,
          contractAddresses: normalizedContractAddresses,
        });
      }
    } catch {
      try {
        await this.#storage.delete(storeKey);
      } catch {
        /* best effort */
      }
    }

    const key = `${normalizedDelegator}:${normalizedContractAddresses.join(",")}`;
    if (!this.#createPromise || this.#createPromiseKey !== key) {
      this.#createPromiseKey = key;
      this.#createPromise = this.#create(normalizedDelegator, normalizedContractAddresses)
        .then((creds) => {
          this.#emit({
            type: ZamaSDKEvents.CredentialsAllowed,
            contractAddresses: normalizedContractAddresses,
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

  /**
   * Check if stored credentials exist and are expired.
   * Returns `true` if credentials are stored but past their expiration time.
   * Returns `false` if no credentials are stored or if they are still valid.
   */
  async isExpired(delegatorAddress: Address, contractAddress?: Address): Promise<boolean> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const storeKey = await this.#storeKey(normalizedDelegator);
    try {
      const stored = await this.#storage.get(storeKey);
      if (!stored) return false;

      const encrypted = stored as unknown;
      this.#assertEncryptedCredentials(encrypted);

      const requiredContracts = contractAddress ? [contractAddress] : [];
      return !this.#isValid(encrypted, requiredContracts);
    } catch {
      return false;
    }
  }

  /**
   * Revoke the session signature for a delegator. Stored credentials
   * remain intact, but the next call to `allow` will require a fresh wallet signature.
   */
  async revoke(delegatorAddress: Address): Promise<void> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const storeKey = await this.#storeKey(normalizedDelegator);
    await this.#sessionStorage.delete(storeKey);
    this.#clearCryptoCache();
    this.#emit({ type: ZamaSDKEvents.CredentialsRevoked });
  }

  /**
   * Whether a session signature is currently cached for a delegator.
   */
  async isAllowed(delegatorAddress: Address): Promise<boolean> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const storeKey = await this.#storeKey(normalizedDelegator);
    const entry = await this.#getSessionEntry(storeKey);
    if (entry === null) return false;
    return !this.#isSessionExpired(entry);
  }

  /**
   * Delete all stored credentials for a delegator (best-effort).
   */
  async clear(delegatorAddress: Address): Promise<void> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const storeKey = await this.#storeKey(normalizedDelegator);
    await this.#sessionStorage.delete(storeKey);
    this.#clearCryptoCache();
    try {
      await this.#storage.delete(storeKey);
    } catch {
      // Best effort
    }
  }

  /** Clear cached cryptographic material. */
  #clearCryptoCache(): void {
    this.#cachedDerivedKey = null;
    this.#cachedDerivedKeyIdentity = null;
  }

  /** Returns a truncated SHA-256 hash of (delegate, delegator, chainId). */
  async #storeKey(delegatorAddress: Address): Promise<string> {
    const delegateAddress = await this.#signer.getAddress();
    const chainId = await this.#signer.getChainId();
    return DelegatedCredentialsManager.computeStoreKey(delegateAddress, delegatorAddress, chainId);
  }

  /** Check if a session entry has expired based on its recorded TTL. `ttl === 0` means never expire. */
  #isSessionExpired(entry: SessionEntry): boolean {
    // Intentionally returns false for ttl === 0 (infinite session) —
    // this differs from CredentialsManager where 0 means "expired immediately".
    if (entry.ttl === 0) return false;
    return Math.floor(Date.now() / 1000) - entry.createdAt >= entry.ttl;
  }

  async #getSessionEntry(storeKey: string): Promise<SessionEntry | null> {
    const raw = await this.#sessionStorage.get<SessionEntry>(storeKey);
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
    if (!this.#isTimeValid(creds)) return false;
    return this.#coversContracts(creds.contractAddresses, requiredContracts);
  }

  #isTimeValid(creds: { startTimestamp: number; durationDays: number }): boolean {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = creds.startTimestamp + creds.durationDays * 86400;
    return nowSeconds < expiresAt;
  }

  #coversContracts(signedAddresses: Address[], requiredContracts: Address[]): boolean {
    const required = new Set(requiredContracts.map((address) => getAddress(address)));
    const signed = new Set(signedAddresses.map((address) => getAddress(address)));
    return required.isSubsetOf(signed);
  }

  async #sign(encrypted: EncryptedCredentials): Promise<Hex> {
    return this.#signWithContracts(encrypted, encrypted.contractAddresses);
  }

  async #signWithContracts(
    keypairMeta: {
      publicKey: Hex;
      startTimestamp: number;
      durationDays: number;
      delegatorAddress: Address;
    },
    contractAddresses: Address[],
  ): Promise<Hex> {
    const delegatedEIP712 = await this.#relayer.createDelegatedUserDecryptEIP712(
      keypairMeta.publicKey,
      contractAddresses,
      keypairMeta.delegatorAddress,
      keypairMeta.startTimestamp,
      keypairMeta.durationDays,
    );
    return this.#signer.signTypedData({
      domain: {
        ...delegatedEIP712.domain,
        chainId: Number(delegatedEIP712.domain.chainId),
      },
      types: delegatedEIP712.types,
      message: {
        ...delegatedEIP712.message,
        startTimestamp: BigInt(delegatedEIP712.message.startTimestamp),
        durationDays: BigInt(delegatedEIP712.message.durationDays),
      },
    });
  }

  #mergeContracts(existing: Address[], incoming: Address[]): Address[] {
    const merged = new Set([...existing, ...incoming]);
    return this.#normalizeAddresses([...merged]);
  }

  async #extendContracts({
    storeKey,
    credentials,
    requiredContracts,
  }: {
    storeKey: string;
    credentials: DelegatedStoredCredentials;
    requiredContracts: Address[];
  }): Promise<DelegatedStoredCredentials> {
    if (this.#extendPromise) {
      const previous = await this.#extendPromise;
      if (this.#coversContracts(previous.contractAddresses, requiredContracts)) {
        this.#emit({
          type: ZamaSDKEvents.CredentialsAllowed,
          contractAddresses: requiredContracts,
        });
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
    credentials: DelegatedStoredCredentials;
    requiredContracts: Address[];
  }): Promise<DelegatedStoredCredentials> {
    const merged = this.#mergeContracts(credentials.contractAddresses, requiredContracts);
    const signature = await this.#signWithContracts(credentials, merged);

    const extended: DelegatedStoredCredentials = {
      ...credentials,
      contractAddresses: merged,
      signature,
    };
    await this.#persistCredentials(storeKey, extended);
    await this.#setSessionEntry(storeKey, signature);
    this.#emit({ type: ZamaSDKEvents.CredentialsAllowed, contractAddresses: requiredContracts });
    return extended;
  }

  async #persistCredentials(storeKey: string, creds: DelegatedStoredCredentials): Promise<void> {
    try {
      const encrypted = await this.#encryptCredentials(creds);
      await this.#storage.set(storeKey, encrypted);
    } catch {
      // Store write failed — credentials still usable in memory
    }
  }

  // ── Credential generation ───────────────────────────────────

  async #create(
    delegatorAddress: Address,
    contractAddresses: Address[],
  ): Promise<DelegatedStoredCredentials> {
    const normalizedContractAddresses = this.#normalizeAddresses(contractAddresses);

    this.#emit({
      type: ZamaSDKEvents.CredentialsCreating,
      contractAddresses: normalizedContractAddresses,
    });
    try {
      const storeKey = await this.#storeKey(delegatorAddress);
      const keypair = await this.#relayer.generateKeypair();
      const delegateAddress = await this.#signer.getAddress();
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = Math.ceil(this.#keypairTTL / 86400);

      const publicKey = keypair.publicKey;
      const privateKey = keypair.privateKey;

      const signature = await this.#signWithContracts(
        { publicKey, startTimestamp, durationDays, delegatorAddress },
        normalizedContractAddresses,
      );

      const creds: DelegatedStoredCredentials = {
        publicKey,
        privateKey,
        signature,
        contractAddresses: normalizedContractAddresses,
        startTimestamp,
        durationDays,
        delegatorAddress,
        delegateAddress,
      };

      await this.#persistCredentials(storeKey, creds);
      await this.#setSessionEntry(storeKey, signature);

      this.#emit({
        type: ZamaSDKEvents.CredentialsCreated,
        contractAddresses: normalizedContractAddresses,
      });
      return creds;
    } catch (error) {
      const isRejected =
        (error instanceof Error && "code" in error && error.code === 4001) ||
        (error instanceof Error &&
          (error.message.includes("rejected") || error.message.includes("denied")));
      if (isRejected) {
        throw new SigningRejectedError(
          "User rejected the delegated decrypt authorization signature",
          {
            cause: error,
          },
        );
      }
      throw new SigningFailedError("Failed to create delegated decrypt credentials", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // ── AES-GCM encryption  ─────────────

  async #encryptCredentials(creds: DelegatedStoredCredentials): Promise<EncryptedCredentials> {
    const address = await this.#signer.getAddress();
    const encryptedPrivateKey = await this.#encrypt(creds.privateKey, creds.signature, address);
    const { privateKey: _, signature: _sig, ...rest } = creds;
    return { ...rest, encryptedPrivateKey };
  }

  async #decryptCredentials(
    encrypted: EncryptedCredentials,
    signature: Hex,
  ): Promise<DelegatedStoredCredentials> {
    const address = await this.#signer.getAddress();
    const privateKey = await this.#decrypt(encrypted.encryptedPrivateKey, signature, address);
    const { encryptedPrivateKey: _, ...rest } = encrypted;
    return { ...rest, privateKey, signature };
  }

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

  async #decrypt(encrypted: EncryptedData, signature: Hex, address: Address): Promise<Hex> {
    const key = await this.#deriveKey(signature, address);
    const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));

    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

    return prefixHex(new TextDecoder().decode(plaintext));
  }
}
