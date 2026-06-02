"use client";

import { ZamaSDK, type Address, type ZamaConfig } from "@zama-fhe/sdk";
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

function warmKeypair(sdk: ZamaSDK, address: Address | undefined): void {
  if (!address) {
    return;
  }
  void sdk.permits.warmKeypair(address).catch((error: unknown) => {
    // Warmup is a latency optimization — the first real permit/decrypt call
    // will lazily retry keypair generation and surface actionable errors.
    // We still log so persistent failures (storage corruption, relayer 4xx
    // during keypair generation) leave a breadcrumb during debugging.
    // oxlint-disable-next-line no-console
    console.warn("[zama-sdk] warm keypair failed:", error);
  });
}

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

  // Keypair warming may touch `new Worker(...)` (web() relayer), which is
  // undefined during SSR. Driving warmup from a client-only useEffect rather
  // than the SDK constructor keeps server-rendered trees free of browser-only
  // infrastructure. Non-React framework adapters need to mirror this contract:
  // call `sdk.permits.warmKeypair(address)` on mount with the current snapshot's
  // address and on every `onWalletAccountChange` with `next?.address` — the SDK
  // no longer warms itself. The explicit-address form is preferred over the
  // no-arg form because it sidesteps the wallet-alignment race during mount.
  useEffect(() => {
    warmKeypair(sdk, sdk.signer?.walletAccount.getSnapshot()?.address);
    return sdk.onWalletAccountChange(({ previous, next }) => {
      if (previous) {
        invalidateWalletLifecycleQueries(queryClient);
      }
      warmKeypair(sdk, next?.address);
    });
  }, [sdk, queryClient]);

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
