"use client";

import { ZamaSDK, type ZamaConfig, type WalletAccount } from "@zama-fhe/sdk";
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

function warmKeypair(sdk: ZamaSDK, account: WalletAccount | undefined): void {
  if (!account) {
    return;
  }
  void sdk.permits.warmKeypair(account).catch((error: unknown) => {
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

  // Keypair warming must run client-only (it touches `new Worker(...)`), so it
  // lives in a useEffect rather than inside the SDK constructor. Any non-React
  // framework adapter needs to mirror this: call `sdk.permits.warmKeypair()` on
  // mount and on every `onWalletAccountChange` — the SDK no longer warms itself.
  useEffect(() => {
    warmKeypair(sdk, sdk.signer?.walletAccount.getSnapshot());
    return sdk.onWalletAccountChange(({ previous, next }) => {
      if (previous) {
        invalidateWalletLifecycleQueries(queryClient);
      }
      warmKeypair(sdk, next);
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
