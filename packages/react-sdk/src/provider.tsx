"use client";

import type {
  Address,
  GenericProvider,
  GenericSigner,
  GenericStorage,
  RelayerSDK,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
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
  useState,
} from "react";

/** Props for {@link ZamaProvider}. */
export interface ZamaProviderProps extends PropsWithChildren {
  /** FHE relayer backend (RelayerWeb for browser, RelayerNode for server). */
  relayer: RelayerSDK;
  /**
   * Read-only chain provider (`ViemProvider`, `EthersProvider`, `WagmiProvider`,
   * or custom {@link GenericProvider}). Used for every public chain read.
   */
  provider: GenericProvider;
  /**
   * Wallet signer (`ViemSigner`, `EthersSigner`, `WagmiSigner`, or custom
   * {@link GenericSigner}). Omit for read-only integrations.
   */
  signer?: GenericSigner;
  /** Credential storage backend (IndexedDBStorage for browser, MemoryStorage for tests). */
  storage: GenericStorage;
  /**
   * Session storage for wallet signatures. Defaults to in-memory (lost on reload).
   * Pass a `chrome.storage.session`-backed store for web extensions.
   */
  sessionStorage?: GenericStorage;
  /**
   * How long the ML-KEM re-encryption keypair remains valid, in seconds.
   * Default: `86400` (1 day). Must be positive — `0` is rejected.
   */
  keypairTTL?: number;
  /**
   * Controls how long session signatures (EIP-712 wallet signatures) remain valid, in seconds.
   * Default: `2592000` (30 days).
   * - `0`: never persist — every operation triggers a signing prompt (high-security mode).
   * - Positive number: seconds until the session signature expires and requires re-authentication.
   */
  sessionTTL?: number;
  /**
   * Per-chain wrappers registry address overrides, merged on top of built-in defaults.
   * Use this for custom or local chains (e.g. Hardhat) where no default registry exists.
   */
  registryAddresses?: Record<number, Address>;
  /**
   * How long cached registry results remain valid, in seconds.
   * Default: `86400` (24 hours).
   */
  registryTTL?: number;
  /** Callback invoked on SDK lifecycle events. */
  onEvent?: ZamaSDKEventListener;
}

interface ZamaSDKContextValue {
  sdk: ZamaSDK;
  signerAddress: Address | undefined;
}

const ZamaSDKContext = createContext<ZamaSDKContextValue | null>(null);

/**
 * Provides a {@link ZamaSDK} instance to all descendant hooks.
 *
 * @example
 * ```tsx
 * <ZamaProvider relayer={relayer} provider={provider} signer={signer} storage={storage}>
 *   <App />
 * </ZamaProvider>
 * ```
 */
export function ZamaProvider({
  children,
  relayer,
  provider,
  signer,
  storage,
  sessionStorage,
  keypairTTL,
  sessionTTL,
  registryAddresses,
  registryTTL,
  onEvent,
}: ZamaProviderProps) {
  const queryClient = useQueryClient();

  // Stabilize onEvent so an inline arrow doesn't recreate the SDK every render.
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const signerLifecycleCallbacks = useMemo(
    () =>
      signer?.subscribe
        ? {
            onDisconnect: () => invalidateWalletLifecycleQueries(queryClient),
            onAccountChange: () => invalidateWalletLifecycleQueries(queryClient),
            onChainChange: () => invalidateWalletLifecycleQueries(queryClient),
          }
        : undefined,
    [queryClient, signer],
  );

  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer,
        provider,
        signer,
        storage,
        sessionStorage,
        keypairTTL,
        sessionTTL,
        registryAddresses,
        registryTTL,
        onEvent: onEventRef.current,
        signerLifecycleCallbacks,
      }),
    [
      relayer,
      provider,
      signer,
      storage,
      sessionStorage,
      keypairTTL,
      sessionTTL,
      registryAddresses,
      registryTTL,
      signerLifecycleCallbacks,
    ],
  );

  // Clean up signer subscriptions on unmount without terminating the
  // caller-owned relayer. dispose() only unsubscribes from wallet events
  // and is idempotent.
  useEffect(() => () => sdk.dispose(), [sdk]);

  // Resolve and track the signer address as React state so hooks read it
  // synchronously without needing a query factory.
  const [signerAddress, setSignerAddress] = useState<Address | undefined>();

  useEffect(() => {
    if (!sdk.signer) {
      setSignerAddress(undefined);
      return;
    }
    let cancelled = false;
    sdk.signer.getAddress().then(
      (addr) => {
        if (!cancelled) setSignerAddress(addr);
      },
      () => {
        // Signer not ready — signerAddress stays undefined until subscribe fires
      },
    );
    const unsub = sdk.signer.subscribe?.({
      onAccountChange: (addr) => setSignerAddress(addr),
      onDisconnect: () => setSignerAddress(undefined),
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [sdk.signer]);

  const contextValue = useMemo(() => ({ sdk, signerAddress }), [sdk, signerAddress]);

  return <ZamaSDKContext.Provider value={contextValue}>{children}</ZamaSDKContext.Provider>;
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
        "Wrap your component tree in <ZamaProvider relayer={…} provider={…} signer={…} storage={…}>.",
    );
  }

  return context.sdk;
}

/**
 * Access the current signer address from context.
 * Returns `undefined` when no signer is configured or the address has not yet resolved.
 *
 * @example
 * ```tsx
 * const address = useSignerAddress();
 * ```
 */
export function useSignerAddress(): Address | undefined {
  const context = useContext(ZamaSDKContext);

  if (!context) {
    throw new Error(
      "useSignerAddress must be used within a <ZamaProvider>. " +
        "Wrap your component tree in <ZamaProvider relayer={…} provider={…} signer={…} storage={…}>.",
    );
  }

  return context.signerAddress;
}
