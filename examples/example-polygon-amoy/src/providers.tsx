"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { polygonAmoy } from "wagmi/chains";
import { injected } from "wagmi/connectors/injected";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { indexedDBStorage } from "@zama-fhe/sdk";
import { polygonAmoy as fhePolygonAmoy, type FheChain } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { AMOY_RPC_URL } from "@/lib/config";

// Stable module-level references: recreating on re-render would reset wagmi's state.
const wagmiConfig = createConfig({
  chains: [polygonAmoy],
  connectors: [injected()],
  // AMOY_RPC_URL overrides the default RPC if NEXT_PUBLIC_AMOY_RPC_URL is set.
  transports: { [polygonAmoy.id]: http(AMOY_RPC_URL) },
});

// Route relayer traffic through the local Next.js proxy so RELAYER_API_KEY stays server-side.
const zamaPolygonAmoy = {
  ...fhePolygonAmoy,
  relayerUrl: "http://localhost:3006/api/relayer",
  network: AMOY_RPC_URL,
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [zamaPolygonAmoy],
  wagmiConfig,
  // web() runs the browser FHE worker and talks to the relayer over HTTP.
  // Polygon Amoy runs the full FHE stack, so cleartext() is not used here.
  relayers: { [zamaPolygonAmoy.id]: web() },
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
