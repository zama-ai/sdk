"use client";

import {
  DefaultWrappersRegistryAddresses,
  type Address,
  type TokenWrapperPair,
  type EnrichedTokenWrapperPair,
  type PaginatedResult,
} from "@zama-fhe/sdk";
import { listPairsQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Fetches paginated token wrapper pairs from the registry.
 *
 * @param options - Query options: `page` (1-indexed, default `1`), `pageSize` (default `100`), `metadata` (fetch on-chain metadata for both tokens, default `false`).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useListPairs({ page: 1, pageSize: 20 });
 * if (data) {
 *   console.log(`${data.total} pairs, showing page ${data.page}`);
 * }
 * ```
 */
export function useListPairs({
  page = 1,
  pageSize = 100,
  metadata = false,
  wrappersRegistryAddresses = DefaultWrappersRegistryAddresses,
  registryTTL,
}: {
  page?: number;
  pageSize?: number;
  metadata?: boolean;
  wrappersRegistryAddresses?: Record<number, Address>;
  registryTTL?: number;
} = {}) {
  const sdk = useZamaSDK();
  const wrappersRegistryAddress = useWrappersRegistryAddress(wrappersRegistryAddresses);

  return useQuery<PaginatedResult<TokenWrapperPair | EnrichedTokenWrapperPair>>(
    listPairsQueryOptions(sdk.signer, {
      wrappersRegistryAddress,
      page,
      pageSize,
      metadata,
      registryTTL,
    }),
  );
}
