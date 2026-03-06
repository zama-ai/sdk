import type { GenericStorage, UnshieldCallbacks, Hex, PendingUnshieldScope } from "@zama-fhe/sdk";
import { savePendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

/**
 * Wrap user-provided unshield callbacks to automatically persist/clear
 * the pending unshield state in storage.
 *
 * Callbacks are kept synchronous (matching {@link UnshieldCallbacks} types)
 * so they work correctly with the core SDK's `safeCallback` wrapper.
 * Storage operations are fire-and-forget with caught rejections.
 */
export function wrapUnshieldCallbacks(
  storage: GenericStorage,
  scope: PendingUnshieldScope,
  callbacks?: UnshieldCallbacks,
): UnshieldCallbacks {
  return {
    onUnwrapSubmitted: (txHash: Hex) => {
      savePendingUnshield(storage, scope, txHash).catch(() => {});
      callbacks?.onUnwrapSubmitted?.(txHash);
    },
    onFinalizing: () => callbacks?.onFinalizing?.(),
    onFinalizeSubmitted: (txHash: Hex) => {
      clearPendingUnshield(storage, scope).catch(() => {});
      callbacks?.onFinalizeSubmitted?.(txHash);
    },
  };
}
