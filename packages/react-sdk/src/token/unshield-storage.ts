import type { GenericStringStorage, UnshieldCallbacks, Address, Hex } from "@zama-fhe/sdk";
import { savePendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

/**
 * Wrap user-provided unshield callbacks to automatically persist/clear
 * the pending unshield state in storage.
 */
export function wrapUnshieldCallbacks(
  storage: GenericStringStorage,
  wrapperAddress: Address,
  callbacks?: UnshieldCallbacks,
): UnshieldCallbacks {
  return {
    onUnwrapSubmitted: async (txHash: Hex) => {
      await savePendingUnshield(storage, wrapperAddress, txHash);
      callbacks?.onUnwrapSubmitted?.(txHash);
    },
    onFinalizing: () => callbacks?.onFinalizing?.(),
    onFinalizeSubmitted: async (txHash: Hex) => {
      await clearPendingUnshield(storage, wrapperAddress);
      callbacks?.onFinalizeSubmitted?.(txHash);
    },
  };
}
