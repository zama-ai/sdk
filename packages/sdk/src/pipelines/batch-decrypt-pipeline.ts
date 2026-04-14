import type { Address } from "viem";
import type { DecryptCache } from "../decrypt-cache";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import { DecryptionFailedError } from "../errors";
import { toError } from "../utils";
import { assertBigint } from "../utils/assertions";
import type { DecryptHandleEntry } from "./user-decrypt-pipeline";

const ZERO_HANDLE_RE = /^0x0*$/;

/** A token-like entry: address + handle pair for batch decryption. */
export interface BatchDecryptEntry {
  tokenAddress: Address;
  handle: Handle;
}

/** Configuration for the batch decrypt pipeline. */
export interface BatchDecryptConfig {
  ownerAddress: Address;
  cache: DecryptCache;
  onError?: (error: Error, address: Address) => bigint;
  preFlightCheck?: () => Promise<void>;
  decrypt: (entries: DecryptHandleEntry[]) => Promise<Record<Handle, ClearValueType>>;
  errorPrefix: string;
}

/**
 * Batch decrypt pipeline: filters zero/cached handles, delegates to a
 * decrypt pipeline, maps results to `Map<Address, bigint>`, and recovers
 * partial results on failure via cache.
 */
export async function runBatchDecryptPipeline(
  entries: BatchDecryptEntry[],
  config: BatchDecryptConfig,
): Promise<Map<Address, bigint>> {
  const { ownerAddress, cache, decrypt, onError, preFlightCheck, errorPrefix } = config;
  const handles = entries;

  const results = new Map<Address, bigint>();
  const uncachedEntries: BatchDecryptEntry[] = [];
  const handleToAddress = new Map<Handle, Address>();

  // Parallel cache lookups — resolves cached values before the pre-flight
  // check so we skip RPC overhead when all balances are already cached.
  const cachedValues = await Promise.all(
    handles.map((entry) => {
      if (ZERO_HANDLE_RE.test(entry.handle)) {
        return 0n;
      }
      return cache.get(ownerAddress, entry.tokenAddress, entry.handle);
    }),
  );

  for (const [i, entry] of handles.entries()) {
    if (ZERO_HANDLE_RE.test(entry.handle)) {
      results.set(entry.tokenAddress, 0n);
      continue;
    }

    const cached = cachedValues[i];
    if (cached !== null && cached !== undefined) {
      assertBigint(cached, "batchDecrypt: cached");
      results.set(entry.tokenAddress, cached);
      continue;
    }

    uncachedEntries.push(entry);
    handleToAddress.set(entry.handle, entry.tokenAddress);
  }

  if (uncachedEntries.length === 0) {
    return results;
  }

  // Pre-flight check runs after cache lookups — skips RPC overhead
  // when all balances are cached.
  if (preFlightCheck) {
    await preFlightCheck();
  }

  const decryptInput: DecryptHandleEntry[] = uncachedEntries.map((e) => ({
    handle: e.handle,
    contractAddress: e.tokenAddress,
  }));

  try {
    const decrypted = await decrypt(decryptInput);

    for (const entry of uncachedEntries) {
      const value = decrypted[entry.handle];
      if (value === undefined) {
        throw new DecryptionFailedError(
          `${errorPrefix} returned no value for handle ${entry.handle} on token ${entry.tokenAddress}`,
        );
      }
      assertBigint(value, "batchDecrypt: result[handle]");
      results.set(entry.tokenAddress, value);
    }
  } catch (error) {
    // The decrypt pipeline caches each contract's results before moving to
    // the next, so on partial failure we can recover successful values from
    // cache and apply onError only to truly failed tokens.
    const errors: { address: Address; error: Error }[] = [];
    const pipelineError = toError(error);

    for (const entry of uncachedEntries) {
      if (results.has(entry.tokenAddress)) {
        continue;
      }

      const cached = await cache.get(ownerAddress, entry.tokenAddress, entry.handle);
      if (cached !== null) {
        assertBigint(cached, "batchDecrypt: cached recovery");
        results.set(entry.tokenAddress, cached);
        continue;
      }

      if (onError) {
        try {
          results.set(entry.tokenAddress, onError(pipelineError, entry.tokenAddress));
        } catch (callbackError) {
          errors.push({
            address: entry.tokenAddress,
            error: toError(callbackError),
          });
        }
      } else {
        errors.push({ address: entry.tokenAddress, error: pipelineError });
      }
    }

    if (errors.length > 0) {
      const message = errors.map((e) => `${e.address}: ${e.error.message}`).join("; ");
      throw new DecryptionFailedError(
        `${errorPrefix} failed for ${errors.length} token(s): ${message}`,
      );
    }
  }

  return results;
}
