"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext, indexedDBStorage, type RelayerConfig } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { NETWORK_KEYS, networks } from "@/lib/networks";

// Stable module-level references — recreating on re-render would reset wagmi's state.
// Every row of the network table is registered; the picker decides which ones are offered.
// Destructuring gives the non-empty tuple type both configs require.
const [firstChain, ...otherChains] = NETWORK_KEYS.map((key) => networks[key].chain);
const chains = [firstChain, ...otherChains] as const;

const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  // The page is server-rendered as disconnected. Without this, wagmi restores a stored
  // connection synchronously on the client's first render and React reports a hydration
  // mismatch; with it, the restore runs after mount.
  ssr: true,
  transports: Object.fromEntries(
    chains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
  ),
});

// Relayer traffic goes through the same-origin Next.js proxy so API keys stay server-side.
// The relayer requires an absolute URL, so resolve the origin at runtime; the SSR
// placeholder never issues requests. Cleartext networks have no relayer at all.
const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

const [firstFheChain, ...otherFheChains] = NETWORK_KEYS.map((key) => {
  const { fhe, transport } = networks[key];
  return transport === "relayer" ? { ...fhe, relayerUrl: `${origin}/api/relayer/${key}` } : fhe;
});
const fheChains = [firstFheChain, ...otherFheChains] as const;

const relayers = Object.fromEntries(
  NETWORK_KEYS.map((key) => {
    const { chain, transport } = networks[key];
    return [chain.id, transport === "relayer" ? web() : cleartext()];
  }),
) as Record<number, RelayerConfig>;

const zamaConfig = createZamaConfig({
  wagmiConfig,
  chains: fheChains,
  relayers,
  storage: indexedDBStorage,
  permitStorage: indexedDBStorage,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
