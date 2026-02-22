import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { Address } from "../relayer/relayer-sdk.types";
import type { GenericSigner, GenericStringStorage, StoredCredentials } from "./token.types";
import { TokenError, TokenErrorCode } from "./token.types";

/** Encrypted data format with IV for AES-GCM decryption. */
interface EncryptedData {
  iv: string; // Base64-encoded IV
  ciphertext: string; // Base64-encoded encrypted data
}

/** Internal storage shape — privateKey is replaced by its encrypted form. */
interface EncryptedCredentials extends Omit<StoredCredentials, "privateKey"> {
  encryptedPrivateKey: EncryptedData;
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
  sdk: RelayerSDK;
  /** Wallet signer for signing EIP-712 typed data. */
  signer: GenericSigner;
  /** Credential storage backend for persisting encrypted credentials. */
  storage: GenericStringStorage;
  /** Number of days generated credentials remain valid. */
  durationDays: number;
}

export class CredentialsManager {
  #sdk: RelayerSDK;
  #signer: GenericSigner;
  #storage: GenericStringStorage;
  #durationDays: number;
  #createPromise: Promise<StoredCredentials> | null = null;
  #createPromiseKey: string | null = null;

  constructor(config: CredentialsManagerConfig) {
    this.#sdk = config.sdk;
    this.#signer = config.signer;
    this.#storage = config.storage;
    this.#durationDays = config.durationDays;
  }

  /**
   * Get or create FHE credentials for a single contract address.
   * Shorthand for `getAll([contractAddress])`.
   *
   * @example
   * ```ts
   * const creds = await credentials.get("0xTokenAddress");
   * ```
   */
  async get(contractAddress: Address): Promise<StoredCredentials> {
    return this.getAll([contractAddress]);
  }

  /**
   * Get or create FHE credentials covering multiple contract addresses.
   * Returns cached credentials if still valid and covering all addresses,
   * otherwise generates a fresh keypair and requests an EIP-712 signature.
   *
   * @example
   * ```ts
   * const creds = await credentials.getAll(["0xTokenA", "0xTokenB"]);
   * ```
   */
  async getAll(contractAddresses: Address[]): Promise<StoredCredentials> {
    const storeKey = await this.#storeKey();
    try {
      const stored = await this.#storage.getItem(storeKey);
      if (stored) {
        const encrypted = JSON.parse(stored) as EncryptedCredentials;
        const creds = await this.#decryptCredentials(encrypted);
        if (this.#isValid(creds, contractAddresses)) {
          return creds;
        }
      }
    } catch {
      // Stored credentials unreadable (corrupt, schema change, decryption failure).
      // Fall through to regeneration.
    }

    const key = contractAddresses.slice().sort().join(",");
    if (!this.#createPromise || this.#createPromiseKey !== key) {
      this.#createPromiseKey = key;
      this.#createPromise = this.create(contractAddresses).finally(() => {
        this.#createPromise = null;
        this.#createPromiseKey = null;
      });
    }
    return this.#createPromise;
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
    try {
      await this.#storage.removeItem(storeKey);
    } catch {
      // Best effort
    }
  }

  /** Returns a truncated SHA-256 hash of the address to avoid leaking it in storage. */
  async #storeKey(): Promise<string> {
    const address = (await this.#signer.getAddress()).toLowerCase();
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, 32);
  }

  // ── Validation ──────────────────────────────────────────────

  #isValid(creds: StoredCredentials, requiredContracts: Address[]): boolean {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = creds.startTimestamp + creds.durationDays * 86400;
    if (nowSeconds >= expiresAt) return false;

    const signedSet = new Set(creds.contractAddresses.map((a) => a.toLowerCase()));
    return requiredContracts.every((addr) => signedSet.has(addr.toLowerCase()));
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
    try {
      const keypair = await this.#sdk.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);

      const eip712 = await this.#sdk.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimestamp,
        this.#durationDays,
      );

      const signature = await this.#signer.signTypedData(eip712);

      const creds: StoredCredentials = {
        publicKey: keypair.publicKey,
        privateKey: keypair.privateKey,
        signature,
        contractAddresses,
        startTimestamp,
        durationDays: this.#durationDays,
      };

      const storeKey = await this.#storeKey();
      try {
        const encrypted = await this.#encryptCredentials(creds);
        await this.#storage.setItem(storeKey, JSON.stringify(encrypted));
      } catch {
        // Store write failed — credentials still usable in memory
      }

      return creds;
    } catch (error) {
      const isRejected =
        (error instanceof Error && "code" in error && error.code === 4001) ||
        (error instanceof Error &&
          (error.message.includes("rejected") || error.message.includes("denied")));
      if (isRejected) {
        throw new TokenError(
          TokenErrorCode.SigningRejected,
          "User rejected the decrypt authorization signature",
          { cause: error },
        );
      }
      throw new TokenError(TokenErrorCode.SigningFailed, "Failed to create decrypt credentials", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // ── AES-GCM encryption (ported from KeypairDB) ─────────────

  async #encryptCredentials(creds: StoredCredentials): Promise<EncryptedCredentials> {
    const address = (await this.#signer.getAddress()).toLowerCase();
    const encryptedPrivateKey = await this.#encrypt(creds.privateKey, creds.signature, address);
    const { privateKey: _, ...rest } = creds;
    return { ...rest, encryptedPrivateKey };
  }

  async #decryptCredentials(encrypted: EncryptedCredentials): Promise<StoredCredentials> {
    const address = (await this.#signer.getAddress()).toLowerCase();
    const privateKey = await this.#decrypt(
      encrypted.encryptedPrivateKey,
      encrypted.signature,
      address,
    );
    const { encryptedPrivateKey: _, ...rest } = encrypted;
    return { ...rest, privateKey };
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
        iterations: 100000,
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
