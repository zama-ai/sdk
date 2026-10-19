"use client";

import type { ZamaSDK } from "@zama-fhe/sdk";

/**
 * Invalidate once `resolve` settles, without making `onSuccess` async: the
 * transaction is already mined by then, so awaiting an RPC read there would
 * report a mined transaction as a failed mutation whenever that read fails.
 * Invalidation is best-effort housekeeping — a failure is logged, not thrown.
 */
export function invalidateOnceResolved<T>(
  sdk: ZamaSDK,
  operation: string,
  resolve: Promise<T>,
  invalidate: (value: T) => void,
): void {
  void resolve.then(invalidate).catch((error: unknown) => {
    sdk.logger.warn(`${operation}: cache invalidation skipped`, { error });
  });
}
