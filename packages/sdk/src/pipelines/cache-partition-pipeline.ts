import { getAddress, type Address } from "viem";
import type { DecryptCache } from "../decrypt-cache";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { DecryptHandleEntry } from "./user-decrypt-pipeline";

/** Result of partitioning handles into cached hits and uncached misses. */
export interface CachePartition {
  /** Already-resolved values keyed by handle. */
  result: Record<Handle, ClearValueType>;
  /** Handles that were not found in cache (with normalised contract addresses). */
  uncached: DecryptHandleEntry[];
}

/**
 * Partition a set of decrypt handles into cache hits and misses.
 * Normalises contract addresses via `getAddress` so downstream lookups
 * are consistent.
 *
 * Shared by {@link runUserDecryptPipeline} and
 * {@link runDelegatedDecryptPipeline}.
 */
export async function runCachePartitionPipeline(
  args: { handles: DecryptHandleEntry[]; ownerAddress: Address },
  deps: { cache: DecryptCache },
): Promise<CachePartition> {
  const { handles, ownerAddress } = args;
  const { cache } = deps;
  const result: Record<Handle, ClearValueType> = {};
  const uncached: DecryptHandleEntry[] = [];

  for (const h of handles) {
    const addr = getAddress(h.contractAddress);
    const cached = await cache.get(ownerAddress, addr, h.handle);
    if (cached !== null) {
      result[h.handle] = cached;
    } else {
      uncached.push({ handle: h.handle, contractAddress: addr });
    }
  }

  return { result, uncached };
}
