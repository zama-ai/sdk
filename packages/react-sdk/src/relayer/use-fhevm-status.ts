"use client";

import { useSyncExternalStore } from "react";
import type { RelayerSDKStatus } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/**
 * Subscribe to the FHE relayer lifecycle status (WASM loading state).
 *
 * @returns The current status: `"idle"` | `"initializing"` | `"ready"` | `"error"`.
 *
 * @example
 * ```tsx
 * const status = useFHEvmStatus();
 * if (status === "initializing") return <Spinner />;
 * ```
 */
export function useFHEvmStatus(): RelayerSDKStatus {
  const { relayer } = useZamaSDK();

  return useSyncExternalStore(
    (callback) => {
      if (relayer.onStatusChange) {
        return relayer.onStatusChange(callback);
      }
      return () => {};
    },
    () => {
      if (relayer.getStatus) {
        return relayer.getStatus();
      }
      return "ready" as RelayerSDKStatus;
    },
  );
}
