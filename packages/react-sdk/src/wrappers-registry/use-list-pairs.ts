"use client";

import type {
  TokenWrapperPair,
  TokenWrapperPairWithMetadata,
  PaginatedResult,
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
}: {
  page?: number;
  pageSize?: number;
  metadata?: boolean;
} = {}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress();

  // Pass sdk.registry (a lazy singleton) so the class-level TTL cache is shared
  // across all queryFn executions — rather than constructing a new instance each time.
  return useQuery<PaginatedResult<TokenWrapperPair | TokenWrapperPairWithMetadata>>(
    listPairsQueryOptions(sdk.registry, {
      registryAddress,
      page,
      pageSize,
      metadata,
    }),
  );
}
