"use client";

import { ZamaSDK } from "@zama-fhe/sdk";
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
import type { ZamaConfig } from "./config";

/** Props for {@link ZamaProvider}. */
export interface ZamaProviderProps extends PropsWithChildren {
  /** Configuration object created by {@link createZamaConfig}. */
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
  const onEventRef = useRef(config._onEvent);

  useEffect(() => {
    onEventRef.current = config._onEvent;
  });

  const signerLifecycleCallbacks = useMemo(
    () =>
      config._signer?.subscribe
        ? {
            onDisconnect: () => invalidateWalletLifecycleQueries(queryClient),
            onAccountChange: () => invalidateWalletLifecycleQueries(queryClient),
            onChainChange: () => invalidateWalletLifecycleQueries(queryClient),
          }
        : undefined,
    [queryClient, config._signer],
  );

  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer: config._relayer,
        signer: config._signer,
        storage: config._storage,
        sessionStorage: config._sessionStorage,
        keypairTTL: config._keypairTTL,
        sessionTTL: config._sessionTTL,
        registryAddresses: config._registryAddresses,
        registryTTL: config._registryTTL,
        onEvent: onEventRef.current,
        signerLifecycleCallbacks,
      }),
    [config, signerLifecycleCallbacks],
  );

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
 * const token = sdk.createReadonlyToken("0x...");
 * ```
 */
export function useZamaSDK(): ZamaSDK {
  const context = useContext(ZamaSDKContext);

  if (!context) {
    throw new Error(
      "useZamaSDK must be used within a <ZamaProvider>. " +
        "Wrap your component tree in <ZamaProvider config={createZamaConfig(...)}>.",
    );
  }

  return context;
}
