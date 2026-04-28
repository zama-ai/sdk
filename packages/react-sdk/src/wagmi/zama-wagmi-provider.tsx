"use client";

import {
  buildZamaConfig,
  type ZamaConfig,
  type ZamaConfigBase,
} from "@zama-fhe/sdk";
import type { AtLeastOneChain } from "@zama-fhe/sdk/chains";
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

/**
 * Props for {@link ZamaWagmiProvider}.
 *
 * Mirrors {@link ZamaConfigWagmi} but omits `wagmiConfig` — the provider reads
 * it from `useConfig()` so it can react to wagmi connection state changes.
 */
export interface ZamaWagmiProviderProps<
  TChains extends AtLeastOneChain = AtLeastOneChain,
>
  extends PropsWithChildren, ZamaConfigBase<TChains> {}

/**
 * Wagmi-integrated Zama provider with reactive, connection-aware signer.
 *
 * @deprecated Use `createConfig` from `@zama-fhe/react-sdk/wagmi` with
 * `<ZamaProvider>` instead. The `WagmiSigner` handles connect/disconnect
 * lifecycle via `subscribe()` — no special provider is needed.
 *
 * ```tsx
 * import { createConfig } from "@zama-fhe/react-sdk/wagmi";
 * import { ZamaProvider } from "@zama-fhe/react-sdk";
 *
 * const zamaConfig = createConfig({ wagmiConfig, chains, relayers });
 *
 * <WagmiProvider config={wagmiConfig}>
 *   <ZamaProvider config={zamaConfig}>
 *     <App />
 *   </ZamaProvider>
 * </WagmiProvider>
 * ```
 */
export function ZamaWagmiProvider<TChains extends AtLeastOneChain>({
  children,
  chains,
  relayers,
  storage,
  sessionStorage,
  keypairTTL,
  sessionTTL,
  registryTTL,
  onEvent,
}: ZamaWagmiProviderProps<TChains>) {
  const wagmiConfig = useConfig();
  const connection = useConnection();

  const hasSigner = hasSignerIdentity(connection);

  const config = useMemo<ZamaConfig>(() => {
    const provider = new WagmiProvider({ config: wagmiConfig });
    const signer = hasSigner
      ? new WagmiSigner({ config: wagmiConfig })
      : undefined;
    return buildZamaConfig(signer, provider, {
      chains,
      relayers,
      storage,
      sessionStorage,
      keypairTTL,
      sessionTTL,
      registryTTL,
      onEvent,
    });
  }, [
    wagmiConfig,
    hasSigner,
    chains,
    relayers,
    storage,
    sessionStorage,
    keypairTTL,
    sessionTTL,
    registryTTL,
    onEvent,
  ]);

  return <ZamaProvider config={config}>{children}</ZamaProvider>;
}
