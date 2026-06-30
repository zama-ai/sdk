import { useCallback, useEffect, useState } from "react";
import { clearPendingUnshield, loadPendingUnshield, indexedDBStorage } from "@zama-fhe/sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import type { Hex } from "viem";

export function usePendingUnshield(selectedPair: TokenWrapperPairWithMetadata | null) {
  const [pendingUnshieldHash, setPendingUnshieldHash] = useState<Hex | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncPendingUnshield() {
      if (!selectedPair) {
        if (!cancelled) setPendingUnshieldHash(null);
        return;
      }

      try {
        const hash = await loadPendingUnshield(
          indexedDBStorage,
          selectedPair.confidentialTokenAddress,
        );
        if (!cancelled) setPendingUnshieldHash(hash as Hex | null);
      } catch {
        if (!cancelled) setPendingUnshieldHash(null);
      }
    }

    void syncPendingUnshield();
    return () => {
      cancelled = true;
    };
  }, [selectedPair]);

  const clearStoredPendingUnshield = useCallback(async () => {
    if (!selectedPair) {
      setPendingUnshieldHash(null);
      return;
    }

    await clearPendingUnshield(indexedDBStorage, selectedPair.confidentialTokenAddress);
    setPendingUnshieldHash(null);
  }, [selectedPair]);

  return { pendingUnshieldHash, setPendingUnshieldHash, clearStoredPendingUnshield };
}
