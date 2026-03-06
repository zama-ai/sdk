import type { Handle } from "@zama-fhe/sdk";

/**
 * Query key helpers for the shared decryption cache.
 * Used by useUserDecrypt/usePublicDecrypt to populate,
 * and by useUserDecryptedValue to read.
 */
export const decryptionKeys = {
  value: (handle: Handle) => ["decryptedValue", handle] as const,
};
