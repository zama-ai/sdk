import { zamaQueryKeys } from "@zama-fhe/sdk/query";

/**
 * Query key helpers for the shared decryption cache.
 * Used by useUserDecrypt/usePublicDecrypt to populate,
 * and by useUserDecryptedValue to read.
 */
export const decryptionKeys = {
  value: (handle: `0x${string}`, contractAddress?: `0x${string}`) =>
    zamaQueryKeys.decryption.handle(handle, contractAddress),
};
