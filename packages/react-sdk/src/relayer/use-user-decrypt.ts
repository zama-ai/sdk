"use client";

import type { DecryptResult, UserDecryptQueryConfig } from "@zama-fhe/sdk/query";
import { userDecryptQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";

/** @deprecated Use {@link UserDecryptQueryConfig} directly. */
export type UseUserDecryptConfig = UserDecryptQueryConfig;

/**
 * React hook for FHE user decryption. Thin wrapper around
 * `userDecryptQueryOptions` with `useQuery` semantics.
 */
export function useUserDecrypt(config: UserDecryptQueryConfig) {
  const sdk = useZamaSDK();
  return useQuery<DecryptResult>(userDecryptQueryOptions(sdk, config));
}

/** Return type of {@link useUserDecrypt}. */
export type UseUserDecryptResult = ReturnType<typeof useUserDecrypt>;
