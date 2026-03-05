"use client";

import { useQueries } from "@tanstack/react-query";
import type { DecryptedValue } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";

/**
 * Look up multiple cached decrypted values by their handles.
 * Values are populated automatically when useUserDecrypt or usePublicDecrypt succeed.
 */
export function useUserDecryptedValues(handles: string[]) {
  const results = useQueries({
    queries: handles.map((handle) => ({
      queryKey: decryptionKeys.value(handle),
      queryFn: () => undefined as never,
      enabled: false,
    })),
  });

  const data: Record<string, DecryptedValue | undefined> = {};
  for (let i = 0; i < handles.length; i++) {
    data[handles[i]!] = results[i]!.data as DecryptedValue | undefined;
  }

  return {
    data,
    results,
  };
}
