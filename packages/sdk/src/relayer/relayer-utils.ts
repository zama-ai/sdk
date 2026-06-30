import { isRetryableRelayerError } from "../utils/error";

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

/**
 * Retry a **relayer** operation with exponential backoff.
 *
 * The SDK only owns retries for the relayer transport — the one network actor
 * viem/ethers don't model. Consumer-RPC reads (e.g. the worker's ACL
 * `persistAllowed` pre-check) go through the integrator's own viem/ethers
 * client, which already retries transport faults; retrying them again here would
 * stack on top of that. So this gate ({@link isRetryableRelayerError}) retries
 * only relayer-attributable transients (HTTP 502/503/504 and relayer-boundary
 * network failures) and defers everything else — consumer-RPC faults, timeouts,
 * relayer back-pressure (429, surfaced with `retryAfter`), and terminal errors.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryableRelayerError(error)) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
