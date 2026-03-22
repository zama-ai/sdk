import type { Address, Hex } from "viem";
import { prefixHex } from "../utils";

/** Encrypted data format with IV for AES-GCM decryption. */
export interface EncryptedData {
  /** Base64-encoded initialization vector. */
  iv: string;
  /** Base64-encoded ciphertext. */
  ciphertext: string;
}

/**
 * Manages AES-GCM encryption and decryption of FHE private keys.
 *
 * The encryption key is derived from a wallet signature via PBKDF2
 * (600 000 iterations, SHA-256). The signature is a secret known only
 * to the wallet holder, providing meaningful encryption protection
 * for the stored private key.
 *
 * The derived key is cached internally so that repeated encrypt/decrypt
 * calls with the same (signature, address) pair skip the expensive
 * PBKDF2 derivation.
 */
export class CredentialCrypto {
  #cachedDerivedKey: CryptoKey | null = null;
  #cachedDerivedKeyIdentity: string | null = null;

  /** Clear the cached derived key. Call when the session is revoked or the signer changes. */
  clearCache(): void {
    this.#cachedDerivedKey = null;
    this.#cachedDerivedKeyIdentity = null;
  }

  /** Encrypt an FHE private key using AES-GCM with a key derived from the wallet signature. */
  async encrypt(plaintext: Hex, signature: Hex, address: Address): Promise<EncryptedData> {
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

  /** Decrypt an AES-GCM encrypted FHE private key using a key derived from the wallet signature. */
  async decrypt(encrypted: EncryptedData, signature: Hex, address: Address): Promise<Hex> {
    const key = await this.#deriveKey(signature, address);
    const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));

    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

    return prefixHex(new TextDecoder().decode(plaintext));
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
}
