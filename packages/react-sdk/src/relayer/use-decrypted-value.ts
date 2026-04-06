"use client";

import { skipToken } from "@tanstack/react-query";
import type { ClearValueType } from "@zama-fhe/sdk";
import {
  decryptedValueQueryOptions,
  signerAddressQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import type { DecryptHandle } from "@zama-fhe/sdk/query";
import type { Address } from "viem";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";

export interface UseDecryptedValueConfig {
  /** The handle to read from the decrypt cache. */
  handle: DecryptHandle;
  /** Pass `{ enabled: false }` to disable the query. */
  query?: { enabled?: boolean };
}

/**
 * React hook that reads a single decrypted value from the persistent cache.
 *
 * Pure read — never triggers a wallet signature or relayer call.
 * Returns the cached `ClearValueType` or `undefined` when not yet decrypted.
 *
 * Use `useUserDecrypt` to populate the cache, then `useDecryptedValue`
 * to display cached values automatically on mount / page reload.
 *
 * @param config - The handle to look up and optional query config.
 *
 * @example
 * ```tsx
 * const { data: balance } = useDecryptedValue({
 *   handle: { handle: "0xabc...", contractAddress: "0xToken" },
 * });
 *
 * return <span>{balance?.toString() ?? "Not decrypted yet"}</span>;
 * ```
 */
export function useDecryptedValue(config: UseDecryptedValueConfig) {
  const sdk = useZamaSDK();

  const addressQuery = useQuery<Address>({
    ...signerAddressQueryOptions(sdk.signer),
  });
  const signerAddress = addressQuery.data;

  const queryOpts = signerAddress
    ? decryptedValueQueryOptions(sdk, {
        handle: config.handle,
        signerAddress,
        query: config.query,
      })
    : ({
        queryKey: zamaQueryKeys.decryption.handle(
          config.handle.handle,
          config.handle.contractAddress,
        ),
        queryFn: skipToken,
        enabled: false,
      } as const);

  return useQuery<ClearValueType | null>(queryOpts);
}

/** Return type of {@link useDecryptedValue}. */
export type UseDecryptedValueResult = ReturnType<typeof useDecryptedValue>;
