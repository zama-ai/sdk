"use client";

import { useQuery } from "@tanstack/react-query";
import { hashFn } from "@zama-fhe/sdk/query";
import { decryptionKeys } from "./decryption-cache";

/**
 * Look up a single cached decrypted value by its handle.
 * Values are populated automatically when useUserDecrypt or usePublicDecrypt succeed.
 * You can also populate manually via queryClient.setQueryData(decryptionKeys.value(handle), value).
 */
export function useUserDecryptedValue(handle: string | undefined) {
  return useQuery<bigint>({
    queryKey: decryptionKeys.value(handle ?? ""),
    queryKeyHashFn: hashFn,
    queryFn: () => undefined as never,
    enabled: false,
  });
}
