"use client";

import { useQuery } from "../utils/query";
import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";

/**
 * Look up a single cached decrypted value by its handle.
 * Values are populated automatically when useUserDecrypt or usePublicDecrypt succeed.
 * You can also populate manually via queryClient.setQueryData(decryptionKeys.value(handle), value).
 */
export function useUserDecryptedValue(handle: Handle | undefined) {
  return useQuery<ClearValueType>({
    queryKey: decryptionKeys.value(handle ?? "0x"),
    queryFn: () => undefined as never,
    enabled: false,
  });
}
