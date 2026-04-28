"use client";

import { buildZamaConfig, type ZamaConfig } from "@zama-fhe/sdk";
import type { AtLeastOneChain } from "@zama-fhe/sdk/chains";
import type { PropsWithChildren } from "react";
import { useMemo } from "react";
import { useConfig } from "wagmi";
import { ZamaProvider } from "../provider";
import { useConnection } from "./compat";
import type { ZamaConfigWagmi } from "./config";
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

/**
 * Props for {@link ZamaWagmiProvider}.
 *
 * Mirrors {@link ZamaConfigWagmi} but omits `wagmiConfig` — the provider reads
 * it from `useConfig()` so it can react to wagmi connection state changes.
 */
export interface ZamaWagmiProviderProps<TChains extends AtLeastOneChain = AtLeastOneChain>
  extends PropsWithChildren, Omit<ZamaConfigWagmi<TChains>, "wagmiConfig"> {}

/**
 * Wagmi-integrated Zama provider with reactive, connection-aware signer.
 *
 * Reads wagmi's `Config` from context and watches connection state. Builds a
 * {@link ZamaConfig} with a `WagmiSigner` only when wagmi exposes a concrete
 * wallet identity; otherwise leaves `signer` undefined for read-only usage.
 * The wrapped {@link ZamaProvider} re-creates its `ZamaSDK` whenever the
 * config identity changes (e.g. on connect/disconnect).
 *
 * Must be rendered inside wagmi's own `<WagmiProvider>`.
 *
 * @example
 * ```tsx
 * <WagmiProvider config={wagmiConfig}>
 *   <QueryClientProvider client={queryClient}>
 *     <ZamaWagmiProvider chains={[sepolia]} relayers={{ [sepolia.id]: web() }}>
 *       <App />
 *     </ZamaWagmiProvider>
 *   </QueryClientProvider>
 * </WagmiProvider>
 * ```
 */
export function ZamaWagmiProvider<TChains extends AtLeastOneChain>({
  children,
  ...params
}: ZamaWagmiProviderProps<TChains>) {
  const wagmiConfig = useConfig();
  const connection = useConnection();

  const hasSigner = hasSignerIdentity(connection);

  const config = useMemo<ZamaConfig>(() => {
    const provider = new WagmiProvider({ config: wagmiConfig });
    const signer = hasSigner ? new WagmiSigner({ config: wagmiConfig }) : undefined;
    return buildZamaConfig(signer, provider, params);
    // `params` is spread; React's referential identity is stable per render.
    // Callers that pass inline objects accept the SDK rebuild on each render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [wagmiConfig, hasSigner, params]);

  return <ZamaProvider config={config}>{children}</ZamaProvider>;
}
