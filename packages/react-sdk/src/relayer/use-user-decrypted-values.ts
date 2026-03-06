"use client";

import { useQueries } from "@tanstack/react-query";
import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";

/**
 * Look up multiple cached decrypted values by their handles.
 * Values are populated automatically when useUserDecrypt or usePublicDecrypt succeed.
 */
export function useUserDecryptedValues(handles: Handle[]) {
  const results = useQueries({
    queries: handles.map((handle) => ({
      queryKey: decryptionKeys.value(handle),
      queryFn: () => undefined as never,
      enabled: false,
    })),
  });

  const data: Partial<Record<Handle, ClearValueType | undefined>> = {};
  for (let i = 0; i < handles.length; i++) {
    data[handles[i]!] = results[i]!.data as ClearValueType | undefined;
  }

  return {
    data,
    results,
  };
}
