import type { GenericStorage } from "./token.types";

/**
 * Load and validate encrypted credentials from storage.
 *
 * @returns The validated credentials, or `null` if nothing is stored.
 * @throws If stored data fails assertion (corrupted or incompatible format).
 */
export async function loadEncryptedCredentials<T>(
  storage: GenericStorage,
  storeKey: string,
  assertFn: (data: unknown) => asserts data is T,
): Promise<T | null> {
  const stored = await storage.get(storeKey);
  if (!stored) return null;
  assertFn(stored);
  return stored;
}

/**
 * Persist encrypted credentials to storage (best-effort).
 * Failures are silently swallowed — credentials remain usable in memory.
 *
 * @param encryptFn - Callback that encrypts the credentials before storage.
 */
export async function persistCredentials<TCreds, TEncrypted>(
  storage: GenericStorage,
  storeKey: string,
  creds: TCreds,
  encryptFn: (creds: TCreds) => Promise<TEncrypted>,
): Promise<void> {
  try {
    const encrypted = await encryptFn(creds);
    await storage.set(storeKey, encrypted);
  } catch {
    // Store write failed — credentials still usable in memory
  }
}

/**
 * Delete stored credentials (best-effort).
 * Failures are silently swallowed.
 */
export async function deleteCredentials(storage: GenericStorage, storeKey: string): Promise<void> {
  try {
    await storage.delete(storeKey);
  } catch {
    // Best effort
  }
}
