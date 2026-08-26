"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { indexedDBStorage } from "@zama-fhe/sdk";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { sepolia, SEPOLIA_RPC_URL } from "@/lib/config";

// Stable module-level references — recreating on re-render would reset wagmi's state.
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  // SEPOLIA_RPC_URL overrides the default RPC if NEXT_PUBLIC_SEPOLIA_RPC_URL is set.
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});

// Route relayer traffic through the local Next.js proxy so RELAYER_API_KEY stays server-side.
// The relayer requires an absolute URL, so resolve the same-origin proxy at runtime.
// The SSR placeholder never issues requests.
const relayerProxyUrl =
  typeof window === "undefined"
    ? "http://localhost/api/relayer"
    : `${window.location.origin}/api/relayer`;

const zamaSepolia = {
  ...fheSepolia,
  relayerUrl: relayerProxyUrl,
  network: SEPOLIA_RPC_URL,
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  wagmiConfig,
  chains: [zamaSepolia],
  relayers: { [zamaSepolia.id]: web() },
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
