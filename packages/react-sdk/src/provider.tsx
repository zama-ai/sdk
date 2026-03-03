"use client";

import type {
  GenericSigner,
  GenericStorage,
  RelayerSDK,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
import { ZamaSDK } from "@zama-fhe/sdk";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo } from "react";

/** Props for {@link ZamaProvider}. */
interface ZamaProviderProps extends PropsWithChildren {
  /** FHE relayer backend (RelayerWeb for browser, RelayerNode for server). */
  relayer: RelayerSDK;
  /** Wallet signer (ViemSigner, EthersSigner, or custom GenericSigner). */
  signer: GenericSigner;
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
  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer,
        signer,
        storage,
        sessionStorage,
        credentialDurationDays,
        onEvent,
      }),
    [relayer, signer, storage, sessionStorage, credentialDurationDays, onEvent],
  );

  // Clean up signer subscriptions on unmount without terminating the
  // caller-owned relayer. dispose() only unsubscribes from wallet events
  // and is idempotent.
  useEffect(() => () => sdk.dispose(), [sdk]);

  return <ZamaSDKContext.Provider value={sdk}>{children}</ZamaSDKContext.Provider>;
}

/**
 * Access the {@link ZamaSDK} instance from context.
 * Must be used within a {@link ZamaProvider}.
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
    throw new Error("useZamaSDK must be used within a ZamaProvider");
  }

  return context;
}
