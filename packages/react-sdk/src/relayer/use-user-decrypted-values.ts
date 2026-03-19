"use client";

import { useQueries } from "@tanstack/react-query";
import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import { hashFn, zamaQueryKeys } from "@zama-fhe/sdk/query";

/**
 * Look up multiple cached decrypted values by their handles.
 * Values are populated automatically when `useUserDecrypt` or `usePublicDecrypt` succeed.
 *
 * @deprecated Use `useUserDecrypt({ handles })` instead — it returns cached values
 * automatically via the `values` map and decrypts uncached handles on demand.
 */
export function useUserDecryptedValues(handles: Handle[]) {
  const results = useQueries({
    queries: handles.map((handle) => ({
      queryKey: zamaQueryKeys.decryption.handle(handle),
      queryKeyHashFn: hashFn,
      queryFn: () => undefined as never,
      enabled: false,
    })),
  });

  const data: Record<Handle, ClearValueType | undefined> = {};
  for (let i = 0; i < handles.length; i++) {
    data[handles[i]!] = results[i]!.data as ClearValueType | undefined;
  }

  return {
    data,
    results,
  };
}
