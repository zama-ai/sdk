"use client";

import type {
  GenericSigner,
  GenericStorage,
  RelayerSDK,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
import { ZamaSDK } from "@zama-fhe/sdk";
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
  /** FHE relayer backend (RelayerWeb for browser, RelayerNode for server). */
  relayer: RelayerSDK;
  /**
   * Wallet signer (ViemSigner, EthersSigner, or custom GenericSigner).
   * When `undefined`, the SDK operates in read-only mode — hooks that require
   * a signer (mutations, balance queries) will be disabled until a signer is provided.
   */
  signer?: GenericSigner;
  /** Credential storage backend (IndexedDBStorage for browser, MemoryStorage for tests). */
  storage: GenericStorage;
  /**
   * Session storage for wallet signatures. Defaults to in-memory (lost on reload).
   * Pass a `chrome.storage.session`-backed store for web extensions.
   */
  sessionStorage?: GenericStorage;
  /** Number of days credentials remain valid (default: relayer default). */
  credentialDurationDays?: number;
  /** Callback invoked on SDK lifecycle events. */
  onEvent?: ZamaSDKEventListener;
}

const ZamaSDKContext = createContext<ZamaSDK | null>(null);

/**
 * Provides a {@link ZamaSDK} instance to all descendant hooks.
 *
 * @example
 * ```tsx
 * <ZamaProvider relayer={relayer} signer={signer} storage={storage}>
 *   <App />
 * </ZamaProvider>
 * ```
 */
export function ZamaProvider({
  children,
  relayer,
  signer,
  storage,
  sessionStorage,
  credentialDurationDays,
  onEvent,
}: ZamaProviderProps) {
  // Stabilize onEvent so an inline arrow doesn't recreate the SDK every render.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const sdk = useMemo(
    () =>
      signer
        ? new ZamaSDK({
            relayer,
            signer,
            storage,
            sessionStorage,
            credentialDurationDays,
            onEvent: onEventRef.current,
          })
        : null,
    [relayer, signer, storage, sessionStorage, credentialDurationDays],
  );

  // Clean up signer subscriptions on unmount without terminating the
  // caller-owned relayer. dispose() only unsubscribes from wallet events
  // and is idempotent.
  useEffect(() => () => sdk?.dispose(), [sdk]);

  return <ZamaSDKContext.Provider value={sdk}>{children}</ZamaSDKContext.Provider>;
}

/**
 * Access the {@link ZamaSDK} instance from context.
 * Throws if called outside a {@link ZamaProvider} or when no signer is provided.
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
      "useZamaSDK requires a connected signer. " +
        "Either pass a `signer` prop to <ZamaProvider> or use useOptionalZamaSDK() for read-only mode.",
    );
  }

  return context;
}

/**
 * Access the {@link ZamaSDK} instance, returning `null` when no signer is connected.
 * Use this in components that should render in read-only mode before wallet connection.
 *
 * @example
 * ```tsx
 * const sdk = useReadonlyZamaSDK();
 * if (!sdk) return <ConnectWalletPrompt />;
 * ```
 */
export function useReadonlyZamaSDK(): ZamaSDK | null {
  return useContext(ZamaSDKContext);
}
