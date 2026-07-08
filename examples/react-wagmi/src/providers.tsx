"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { indexedDBStorage } from "@zama-fhe/sdk";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { SEPOLIA_RPC_URL } from "@/lib/config";

// ── What this file does ────────────────────────────────────────────────────────
//
// Wires together the SDK configuration every integration needs:
//
//   const zamaConfig = createZamaConfig({
//     chains: [mySepolia],
//     wagmiConfig,
//     relayers: { [mySepolia.id]: web() },
//     storage: indexedDBStorage,
//     permitStorage: indexedDBStorage,
//   });
//   <ZamaProvider config={zamaConfig}>
//
// wagmiConfig and zamaConfig are at module level — stable references that must not be
// recreated on re-render. The wagmi adapter creates the SDK signer/provider and
// subscribes to wagmi connection changes, so no walletKey remount pattern is needed.
// ──────────────────────────────────────────────────────────────────────────────

// Stable module-level references — recreating on re-render would reset wagmi's state.
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  // SEPOLIA_RPC_URL overrides the default RPC if NEXT_PUBLIC_SEPOLIA_RPC_URL is set.
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});

const RELAYER_PROXY_URL = "http://localhost:3000/api/relayer";

// Route relayer traffic through the local Next.js proxy so RELAYER_API_KEY stays server-side.
const mySepolia = {
  ...fheSepolia,
  relayerUrl: RELAYER_PROXY_URL,
  network: SEPOLIA_RPC_URL,
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
  storage: indexedDBStorage,
  permitStorage: indexedDBStorage,
});

export function Providers({ children }: { children: ReactNode }) {
  // Created once per Providers mount — avoids sharing the QueryClient across
  // SSR requests and React Strict Mode double-invocations.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
