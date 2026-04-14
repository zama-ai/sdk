import type { Address } from "viem";
import type { DecryptCache } from "../decrypt-cache";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import {
  ConfigurationError,
  DecryptionFailedError,
  SigningFailedError,
  SigningRejectedError,
} from "../errors";
import { toError } from "../utils";
import { assertBigint } from "../utils/assertions";
import type { DecryptHandleEntry } from "./user-decrypt-pipeline";

const ZERO_HANDLE_RE = /^0x0*$/;

/** A token-like entry: address + handle pair for batch decryption. */
export interface BatchDecryptEntry {
  tokenAddress: Address;
  handle: Handle;
}

export interface BatchDecryptArgs {
  handles: BatchDecryptEntry[];
  ownerAddress: Address;
  decrypt: (entries: DecryptHandleEntry[]) => Promise<Record<Handle, ClearValueType>>;
}

export interface BatchDecryptDeps {
  cache: DecryptCache;
}

/** Configuration for the batch decrypt pipeline. */
export interface BatchDecryptOptions {
  onError?: (error: Error, address: Address) => bigint;
  preFlightCheck?: () => Promise<void>;
}

/**
 * Batch decrypt pipeline: filters zero/cached handles, delegates to a
 * decrypt pipeline, maps results to `Map<Address, bigint>`, and recovers
 * partial results on failure via cache.
 */
export async function runBatchDecryptPipeline(
  args: BatchDecryptArgs,
  deps: BatchDecryptDeps,
  options: BatchDecryptOptions,
): Promise<{ results: Map<Address, bigint>; errors: Map<Address, Error> }> {
  const { handles, ownerAddress, decrypt } = args;
  const { cache } = deps;
  const { onError, preFlightCheck } = options;

  const results = new Map<Address, bigint>();
  const uncachedEntries: BatchDecryptEntry[] = [];

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
  }

  if (uncachedEntries.length === 0) {
    return { results, errors: new Map() };
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

  const errors = new Map<Address, Error>();
  try {
    const decrypted = await decrypt(decryptInput);

    for (const entry of uncachedEntries) {
      const value = decrypted[entry.handle];
      if (value === undefined) {
        throw new DecryptionFailedError(
          `No value for handle ${entry.handle} on token ${entry.tokenAddress}`,
        );
      }
      assertBigint(value, "batchDecrypt: result[handle]");
      results.set(entry.tokenAddress, value);
    }
  } catch (error) {
    // Non-recoverable errors propagate immediately — no partial recovery.
    if (
      error instanceof SigningRejectedError ||
      error instanceof SigningFailedError ||
      error instanceof ConfigurationError
    ) {
      throw error;
    }

    // The decrypt pipeline caches each contract's results before moving to
    // the next, so on partial failure we can recover successful values from
    // cache and apply onError only to truly failed tokens.
    const pipelineError = toError(error);

    for (const entry of uncachedEntries) {
      if (results.has(entry.tokenAddress)) {
        continue;
      }

      // Recover from cache — a corrupted entry should not torpedo the
      // entire recovery loop, so treat assertion failures as misses.
      try {
        const cached = await cache.get(ownerAddress, entry.tokenAddress, entry.handle);
        if (typeof cached === "bigint") {
          results.set(entry.tokenAddress, cached);
          continue;
        }
      } catch {
        // Corrupted cache entry — fall through to onError.
      }

      if (onError) {
        try {
          results.set(entry.tokenAddress, onError(pipelineError, entry.tokenAddress));
        } catch (callbackError) {
          errors.set(entry.tokenAddress, toError(callbackError));
        }
      } else {
        errors.set(entry.tokenAddress, toError(pipelineError));
      }
    }
  }

  return { results, errors };
}
