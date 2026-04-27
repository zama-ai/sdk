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
  web,
} from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia as fheSepolia } from "@zama-fhe/sdk/chains";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";

// ── What this file does ────────────────────────────────────────────────────────
//
// Wires together the SDK using the wagmi adapter path:
//
//   const wagmiConfig = createConfig({ chains, transports, connectors });
//   const zamaConfig  = createZamaConfig({ wagmiConfig, transports: overrides });
//   <ZamaProvider config={zamaConfig}>
//
// wagmiConfig is at module level — a stable reference that must not be
// recreated on re-render (would reset wagmi's state). This module is only
// evaluated client-side because providers.tsx is wrapped in next/dynamic ssr:false.
//
// createZamaConfig creates a WagmiSigner internally. Account and chain changes
// are handled automatically by wagmi's watchConnection — no walletKey remount
// pattern needed (unlike the viem/ethers examples).
//
// Storage note: the old manual wiring required two separate IndexedDB instances
// (storage + sessionStorage) because both used the same internal key. createZamaConfig
// handles storage internally — no manual IndexedDB setup needed.
//
// See WALKTHROUGH.md §"Architecture at a glance" for the full rationale.
// ──────────────────────────────────────────────────────────────────────────────

// Stable module-level reference — recreating on re-render would reset wagmi's state.
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  // SEPOLIA_RPC_URL overrides the default RPC if NEXT_PUBLIC_SEPOLIA_RPC_URL is set.
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});

// zamaConfig is also module-level since wagmiConfig is stable and the relayer URL
// uses window.location.origin which is constant after page load.
const zamaConfig = createZamaConfig({
  chains: [fheSepolia],
  wagmiConfig,
  transports: {
    [fheSepolia.id]: web({ relayerUrl: `${window.location.origin}/api/relayer` }),
  },
  // ZamaSDKEvents.UnshieldPhase1Submitted fires after Phase 1 is mined (the SDK
  // awaits the receipt before emitting). Saving here ensures the pending state
  // survives a tab close between Phase 1 completion and Phase 2 completion.
  // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
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
  // Created once per Providers mount — avoids sharing the QueryClient across
  // SSR requests and React Strict Mode double-invocations.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {/* WagmiProvider must wrap ZamaProvider so that wagmi hooks (used by WagmiSigner
          internally via watchConnection) have access to the wagmi context. */}
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
