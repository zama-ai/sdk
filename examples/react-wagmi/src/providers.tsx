"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
  createZamaConfig,
  web,
} from "@zama-fhe/react-sdk";
import { sepolia as fheSepolia } from "@zama-fhe/sdk/chains";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";

// ── What this file does ────────────────────────────────────────────────────────
//
// Uses createZamaConfig to wire together the SDK primitives:
//
//   const wagmiConfig = createConfig({ chains, transports, connectors });
//   const zamaConfig  = createZamaConfig({ wagmiConfig, transports: overrides });
//   <ZamaProvider config={zamaConfig}>
//
// WagmiSigner is created internally by createZamaConfig.
// Storage defaults to two separate IndexedDB instances (CredentialStore + SessionStore).
// ──────────────────────────────────────────────────────────────────────────────

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});

const zamaConfig = createZamaConfig({
  chains: [fheSepolia],
  wagmiConfig,
  transports: {
    [fheSepolia.id]: web({ relayerUrl: `${window.location.origin}/api/relayer` }),
  },
  onEvent: (event) => {
    if (event.type === ZamaSDKEvents.UnshieldPhase1Submitted) {
      const wrapperAddress = getActiveUnshieldToken();
      if (wrapperAddress) {
        savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash).catch((err) =>
          console.error("[Providers] Failed to persist pending unshield:", event.txHash, err),
        );
        setActiveUnshieldToken(null);
      }
    }
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
