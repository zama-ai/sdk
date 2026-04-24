"use client";

import type { Address, GenericStorage, RelayerSDK, ZamaSDKEventListener } from "@zama-fhe/sdk";
import type { PropsWithChildren } from "react";
import { useMemo } from "react";
import { useConfig } from "wagmi";
import { ZamaProvider } from "../provider";
import { useConnection } from "./compat";
import { WagmiProvider } from "./wagmi-provider";
import { WagmiSigner } from "./wagmi-signer";

type WagmiConnection = ReturnType<typeof useConnection>;

function hasSignerIdentity(connection: WagmiConnection): boolean {
  return (
    connection.status !== "disconnected" &&
    Boolean(connection.address) &&
    connection.chainId !== undefined
  );
}

/** Props for {@link ZamaWagmiProvider}. */
export interface ZamaWagmiProviderProps extends PropsWithChildren {
  /** FHE relayer backend (RelayerWeb for browser, RelayerNode for server). */
  relayer: RelayerSDK;
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

/**
 * Wagmi-integrated Zama provider.
 *
 * Reads wagmi's connection state and constructs the appropriate provider/signer
 * adapters internally. Pass `signer={undefined}` to the inner `ZamaProvider`
 * until wagmi exposes a concrete wallet identity, eliminating the "stable
 * disconnected signer" class of bugs while preserving persisted identities
 * during wagmi's reconnecting phase.
 *
 * Must be rendered inside wagmi's own `<WagmiProvider>`.
 *
 * @example
 * ```tsx
 * <WagmiProvider config={wagmiConfig}>
 *   <QueryClientProvider client={queryClient}>
 *     <ZamaWagmiProvider relayer={relayer} storage={storage}>
 *       <App />
 *     </ZamaWagmiProvider>
 *   </QueryClientProvider>
 * </WagmiProvider>
 * ```
 */
export function ZamaWagmiProvider({
  children,
  relayer,
  storage,
  sessionStorage,
  keypairTTL,
  sessionTTL,
  registryAddresses,
  registryTTL,
  onEvent,
}: ZamaWagmiProviderProps) {
  const wagmiConfig = useConfig();
  const connection = useConnection();

  const hasSigner = hasSignerIdentity(connection);

  const provider = useMemo(() => new WagmiProvider({ config: wagmiConfig }), [wagmiConfig]);

  const signer = useMemo(
    () => (hasSigner ? new WagmiSigner({ config: wagmiConfig }) : undefined),
    [hasSigner, wagmiConfig],
  );

  return (
    <ZamaProvider
      relayer={relayer}
      provider={provider}
      signer={signer}
      storage={storage}
      sessionStorage={sessionStorage}
      keypairTTL={keypairTTL}
      sessionTTL={sessionTTL}
      registryAddresses={registryAddresses}
      registryTTL={registryTTL}
      onEvent={onEvent}
    >
      {children}
    </ZamaProvider>
  );
}
