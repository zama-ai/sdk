"use client";

import { skipToken } from "@tanstack/react-query";
import type { DecryptHandle, DecryptedValuesResult } from "@zama-fhe/sdk/query";
import {
  decryptedValuesQueryOptions,
  signerAddressQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import type { Address } from "viem";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";

export interface UseDecryptedValuesConfig {
  /** The handles to read from the decrypt cache. */
  handles: DecryptHandle[];
  /** Pass `{ enabled: false }` to disable the query. */
  query?: { enabled?: boolean };
}

/**
 * React hook that reads multiple decrypted values from the persistent cache.
 *
 * Pure read — never triggers a wallet signature or relayer call.
 * Returns a record mapping each handle to its cached value or `null`.
 *
 * Use `useUserDecrypt` to populate the cache, then `useDecryptedValues`
 * to display cached values automatically on mount / page reload.
 *
 * @param config - The handles to look up and optional query config.
 *
 * @example
 * ```tsx
 * const { data } = useDecryptedValues({
 *   handles: [
 *     { handle: "0xabc...", contractAddress: "0xToken" },
 *     { handle: "0xdef...", contractAddress: "0xToken" },
 *   ],
 * });
 *
 * return (
 *   <ul>
 *     {data && Object.entries(data).map(([handle, value]) => (
 *       <li key={handle}>{value?.toString() ?? "pending"}</li>
 *     ))}
 *   </ul>
 * );
 * ```
 */
export function useDecryptedValues(config: UseDecryptedValuesConfig) {
  const sdk = useZamaSDK();

  const addressQuery = useQuery<Address>({
    ...signerAddressQueryOptions(sdk.signer),
  });
  const signerAddress = addressQuery.data;

  const queryOpts = signerAddress
    ? decryptedValuesQueryOptions(sdk, {
        handles: config.handles,
        signerAddress,
        query: config.query,
      })
    : ({
        queryKey: zamaQueryKeys.decryption.handles(config.handles),
        queryFn: skipToken,
        enabled: false,
      } as const);

  return useQuery<DecryptedValuesResult>(queryOpts);
}

/** Return type of {@link useDecryptedValues}. */
export type UseDecryptedValuesResult = ReturnType<typeof useDecryptedValues>;
