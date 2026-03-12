import type { Address, Hex } from "viem";
import type { CredentialEncryptor, EncryptionContext } from "./token.types";
import { assertObject, assertString, prefixHex } from "../utils";

/** Encrypted data format with IV for AES-GCM decryption. */
export interface EncryptedData {
  iv: string; // Base64-encoded IV
  ciphertext: string; // Base64-encoded encrypted data
}

/**
 * Default AES-256-GCM encryptor for FHE credentials.
 *
 * Derives an encryption key from the wallet signature via PBKDF2
 * (600k iterations, SHA-256, salted with the wallet address).
 */
export class AesGcmEncryptor implements CredentialEncryptor {
  #cachedKey: CryptoKey | null = null;
  #cachedKeyIdentity: string | null = null;

  async encrypt(privateKey: Hex, context: EncryptionContext): Promise<EncryptedData> {
    const key = await this.#deriveKey(context.signature, context.address);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(privateKey),
    );
    return {
      iv: btoa(String.fromCharCode(...iv)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    };
  }

  async decrypt(sealed: unknown, context: EncryptionContext): Promise<Hex> {
    this.#assertEncryptedData(sealed);
    const key = await this.#deriveKey(context.signature, context.address);
    const iv = Uint8Array.from(atob(sealed.iv), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(sealed.ciphertext), (c) => c.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return prefixHex(new TextDecoder().decode(plaintext));
  }

  isValidEncryptedData(sealed: unknown): sealed is EncryptedData {
    try {
      assertObject(sealed, "sealed");
      assertString(sealed.id, "sealed.id");
      assertString(sealed.ciphertext, "sealed.ciphertext");
      return true;
    } catch {
      return false;
    }
  }

  #assertEncryptedData(sealed: unknown): asserts sealed is EncryptedData {
    if (!this.isValidEncryptedData(sealed)) {
      throw TypeError("sealed data is not a valid EncryptedData");
    }
  }

  /** PBKDF2 derivation — 600k iterations, SHA-256, salted with address. */
  async #deriveKey(signature: Hex, address: Address): Promise<CryptoKey> {
    const identity = `${signature}:${address}`;
    if (this.#cachedKey && this.#cachedKeyIdentity === identity) {
      return this.#cachedKey;
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
    this.#cachedKeyIdentity = identity;
    this.#cachedKey = key;
    return key;
  }
}
