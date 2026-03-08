/** Encrypted data format with IV for AES-GCM decryption. */
export interface EncryptedData {
  iv: string; // Base64-encoded IV
  ciphertext: string; // Base64-encoded encrypted data
}

/**
 * Derives an AES-GCM encryption key from a wallet signature using PBKDF2.
 * The signature is a secret known only to the wallet holder, providing
 * meaningful encryption protection for the stored private key.
 */
export async function deriveKey(signature: string, address: string): Promise<CryptoKey> {
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
export async function encrypt(
  plaintext: string,
  signature: string,
  address: string,
): Promise<EncryptedData> {
  const key = await deriveKey(signature, address);
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
export async function decrypt(
  encrypted: EncryptedData,
  signature: string,
  address: string,
): Promise<string> {
  const key = await deriveKey(signature, address);
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

  return new TextDecoder().decode(plaintext);
}

/**
 * Returns a truncated SHA-256 hash of the address and chainId.
 * Matches `CredentialsManager.computeStoreKey`.
 */
export async function computeStoreKey(address: string, chainId: number): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${address.toLowerCase()}:${chainId}`),
  );
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32);
}
