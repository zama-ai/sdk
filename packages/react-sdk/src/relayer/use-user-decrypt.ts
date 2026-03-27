"use client";

import { skipToken, type UseQueryOptions } from "@tanstack/react-query";
import type { ClearValueType, Handle } from "@zama-fhe/sdk";
import type { DecryptHandle } from "@zama-fhe/sdk/query";
import {
  signerAddressQueryOptions,
  userDecryptQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";

export type { DecryptHandle };

/** Configuration for {@link useUserDecrypt}. */
export interface UseUserDecryptConfig {
  /** Handles to decrypt, each paired with its contract address. */
  handles: DecryptHandle[];
}

/** Query options for {@link useUserDecrypt}. */
export interface UseUserDecryptOptions extends Omit<
  UseQueryOptions<Record<Handle, ClearValueType>>,
  "queryKey" | "queryFn" | "enabled"
> {
  /**
   * Whether to run the decrypt query.
   * Default: `false`.
   */
  enabled?: boolean;
}

/**
 * Declarative hook for batch user decryption.
 *
 * Decryption can trigger wallet authorization, so this query is opt-in and
 * defaults to `enabled: false`. Once enabled, it can reuse cached plaintext
 * and previously allowed credentials without prompting again.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useUserDecrypt(
 *   { handles: [{ handle: "0xH1", contractAddress: "0xC1" }] },
 *   { enabled: isRevealed },
 * );
 * console.log(data?.["0xH1"]); // 100n
 * ```
 */
export function useUserDecrypt(config: UseUserDecryptConfig, options?: UseUserDecryptOptions) {
  const sdk = useZamaSDK();
  const addressQuery = useQuery({
    ...signerAddressQueryOptions(sdk.signer),
  });

  const account = addressQuery.data;
  const baseOpts = account
    ? userDecryptQueryOptions(sdk, {
        ...config,
        requesterAddress: account,
        query: { ...options, enabled: options?.enabled === true },
      })
    : ({
        queryKey: zamaQueryKeys.decryption.all,
        queryFn: skipToken,
        enabled: false,
      } as const);

  return useQuery<Record<Handle, ClearValueType>>(baseOpts);
}

export type UseUserDecryptResult = ReturnType<typeof useUserDecrypt>;
