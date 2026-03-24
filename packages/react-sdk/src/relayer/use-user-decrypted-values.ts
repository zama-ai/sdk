"use client";

import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useQueries } from "../utils/query";

/**
 * Look up multiple cached decrypted values by their handles.
 * Values are populated automatically when `useUserDecrypt` or `usePublicDecrypt` succeed.
 */
export function useUserDecryptedValues(handles: Handle[]) {
  const results = useQueries({
    queries: handles.map((handle) => ({
      queryKey: zamaQueryKeys.decryption.handle(handle),
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
