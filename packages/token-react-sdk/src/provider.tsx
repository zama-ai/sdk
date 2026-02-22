"use client";

import type { GenericSigner, GenericStringStorage, RelayerSDK } from "@zama-fhe/token-sdk";
import { TokenSDK } from "@zama-fhe/token-sdk";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo } from "react";

/** Props for {@link TokenSDKProvider}. */
interface TokenSDKProviderProps extends PropsWithChildren {
  /** FHE relayer backend (RelayerWeb for browser, RelayerNode for server). */
  relayer: RelayerSDK;
  /** Wallet signer (ViemSigner, EthersSigner, or custom GenericSigner). */
  signer: GenericSigner;
  /** Credential storage backend (IndexedDBStorage for browser, MemoryStorage for tests). */
  storage: GenericStringStorage;
}

const TokenSDKContext = createContext<TokenSDK | null>(null);

/**
 * Provides a {@link TokenSDK} instance to all descendant hooks.
 * Terminates the relayer on unmount.
 *
 * @example
 * ```tsx
 * <TokenSDKProvider relayer={relayer} signer={signer} storage={storage}>
 *   <App />
 * </TokenSDKProvider>
 * ```
 */
export function TokenSDKProvider({ children, relayer, signer, storage }: TokenSDKProviderProps) {
  const sdk = useMemo(
    () =>
      new TokenSDK({
        relayer,
        signer,
        storage,
      }),
    [relayer, signer, storage],
  );

  useEffect(() => {
    return () => sdk.terminate();
  }, [sdk]);

  return <TokenSDKContext.Provider value={sdk}>{children}</TokenSDKContext.Provider>;
}

/**
 * Access the {@link TokenSDK} instance from context.
 * Must be used within a {@link TokenSDKProvider}.
 *
 * @example
 * ```tsx
 * const sdk = useTokenSDK();
 * const token = sdk.createReadonlyToken("0x...");
 * ```
 */
export function useTokenSDK(): TokenSDK {
  const context = useContext(TokenSDKContext);

  if (!context) {
    throw new Error("useTokenSDK must be used within a TokenSDKProvider");
  }

  return context;
}
