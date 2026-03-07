import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { type Address } from "viem";
import { type Handle } from "@zama-fhe/sdk";

/**
 * Query key helpers for the shared decryption cache.
 * Used by useUserDecrypt/usePublicDecrypt to populate,
 * and by useUserDecryptedValue to read.
 */
export const decryptionKeys = {
  value: (handle: Handle, contractAddress?: Address) =>
    zamaQueryKeys.decryption.handle(handle, contractAddress),
};
