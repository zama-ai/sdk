"use client";

import { ZamaSDK, type GenericLogger, type ZamaConfig } from "@zama-fhe/sdk";
import { invalidateWalletLifecycleQueries } from "@zama-fhe/sdk/query";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

/** Props for {@link ZamaProvider}. */
export interface ZamaProviderProps extends PropsWithChildren {
  /** Configuration object created by {@link createConfig}. */
  config: ZamaConfig;
}

const ZamaSDKContext = createContext<ZamaSDK | null>(null);

/**
 * Provides a {@link ZamaSDK} instance to all descendant hooks.
 *
 * @example
 * ```tsx
 * <ZamaProvider config={zamaConfig}>
 *   <App />
 * </ZamaProvider>
 * ```
 */
export function ZamaProvider({ children, config }: ZamaProviderProps) {
  const queryClient = useQueryClient();

  // Stabilize onEvent so an inline arrow doesn't recreate the SDK every render.
  const onEventRef = useRef(config.onEvent);

  useEffect(() => {
    onEventRef.current = config.onEvent;
  });

  const sdk = useMemo(() => new ZamaSDK({ ...config, onEvent: onEventRef.current }), [config]);

  // Transport-key-pair warming touches @fhevm/sdk's browser-only runtime (WASM,
  // and worker threads it may spawn internally), which is undefined during SSR.
  // Driving warmup from a client-only useEffect rather than the SDK constructor
  // keeps server-rendered trees free of browser-only infrastructure. Non-React
  // framework adapters need to mirror this contract:
  // call `sdk.permits.warmTransportKeyPair()` on mount and on every
  // `onWalletAccountChange` — the SDK no longer warms itself.
  useEffect(() => {
    function warmTransportKeyPair(zama: ZamaSDK, logger: GenericLogger): void {
      void zama.permits.warmTransportKeyPair().catch((error: unknown) => {
        // Warmup is a latency optimization — the first real permit/decrypt call
        // will lazily retry transport-key-pair generation and surface actionable
        // errors. We route this through the configured logger (silent by default)
        // so persistent failures (storage corruption, relayer 4xx during
        // generation) leave a breadcrumb during debugging.
        logger.warn("warm transport key pair failed", { error });
      });
    }
    warmTransportKeyPair(sdk, config.logger);
    return sdk.onWalletAccountChange(({ previous }) => {
      if (previous) {
        invalidateWalletLifecycleQueries(queryClient);
      }
      warmTransportKeyPair(sdk, config.logger);
    });
  }, [sdk, queryClient, config.logger]);

  // Clean up SDK-owned signer subscriptions on unmount without terminating
  // the caller-owned relayer. dispose() is idempotent.
  useEffect(() => () => sdk.dispose(), [sdk]);

  return <ZamaSDKContext.Provider value={sdk}>{children}</ZamaSDKContext.Provider>;
}

/**
 * Access the {@link ZamaSDK} instance from context.
 * Throws if called outside a {@link ZamaProvider}.
 *
 * @example
 * ```tsx
 * const sdk = useZamaSDK();
 * const token = sdk.createToken("0x...");
 * ```
 */
export function useZamaSDK(): ZamaSDK {
  const context = useContext(ZamaSDKContext);

  if (!context) {
    throw new Error(
      "useZamaSDK must be used within a <ZamaProvider>. " +
        "Wrap your component tree in <ZamaProvider config={createConfig(...)}>.",
    );
  }
  return context;
}
