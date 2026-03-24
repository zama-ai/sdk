"use client";

import { useState, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import {
  ZamaProvider,
  ZamaSDKEvents,
  IndexedDBStorage,
  indexedDBStorage,
  savePendingUnshield,
  RelayerWeb,
} from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { SepoliaConfig } from "@zama-fhe/sdk";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";

// ── What this file does ────────────────────────────────────────────────────────
//
// Wires together the three SDK primitives every integration needs:
//
//   const signer  = new WagmiSigner({ config: wagmiConfig });
//   const relayer = new RelayerWeb({ getChainId, transports: { [SepoliaConfig.chainId]: ... } });
//   <ZamaProvider relayer={relayer} signer={signer}
//     storage={indexedDBStorage} sessionStorage={sessionDBStorage}>
//
// wagmiConfig and signer are at module level — stable references that must not be
// recreated on re-render (would reset wagmi's state). This module is only evaluated
// client-side because providers.tsx is wrapped in next/dynamic ssr:false.
//
// RelayerWeb is in useMemo because it accesses window.location.origin at construction.
//
// WagmiSigner subscribes to wagmiConfig.watchConnection internally — account and chain
// changes are handled automatically, no walletKey remount pattern needed.
//
// Two separate IndexedDB instances are required: both storage and sessionStorage use
// the same internal key, so sharing one DB would cause the session entry to overwrite
// the encrypted keypair, forcing re-signing on every balance decrypt.
// ──────────────────────────────────────────────────────────────────────────────

// Separate DB from indexedDBStorage — see block comment above for the reason.
const sessionDBStorage = new IndexedDBStorage("SessionStore");

// Stable module-level references — recreating on re-render would reset wagmi's state.
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  // SEPOLIA_RPC_URL overrides the default RPC if NEXT_PUBLIC_SEPOLIA_RPC_URL is set.
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});

// WagmiSigner wraps wagmiConfig — account/chain reactivity is handled internally by wagmi.
const signer = new WagmiSigner({ config: wagmiConfig });

export function Providers({ children }: { children: ReactNode }) {
  // Created once per Providers mount — avoids sharing the QueryClient across
  // SSR requests and React Strict Mode double-invocations.
  const [queryClient] = useState(() => new QueryClient());

  // RelayerWeb accesses window.location.origin at construction — must be in useMemo, not module level.
  // signer.getChainId() is a function reference; it reads from wagmi's store on each call.
  const relayer = useMemo(
    () =>
      new RelayerWeb({
        getChainId: () => signer.getChainId(),
        transports: {
          [SepoliaConfig.chainId]: {
            ...SepoliaConfig,
            relayerUrl: `${window.location.origin}/api/relayer`,
            network: SEPOLIA_RPC_URL,
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* WagmiProvider must wrap ZamaProvider so that wagmi hooks (used by WagmiSigner
          internally via watchConnection) have access to the wagmi context. */}
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider
          relayer={relayer}
          storage={indexedDBStorage}
          sessionStorage={sessionDBStorage}
          signer={signer}
          onEvent={(event) => {
            // Fires right after the Phase 1 tx is submitted (before it is mined).
            // Saving here ensures the pending state survives a tab close between phases.
            // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
            // NOTE: indexedDBStorage must be the same instance as the `storage` prop above.
            if (event.type === ZamaSDKEvents.UnshieldPhase1Submitted) {
              const wrapperAddress = getActiveUnshieldToken();
              if (wrapperAddress) {
                savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash).catch((err) =>
                  console.error(
                    "[Providers] Failed to persist pending unshield:",
                    event.txHash,
                    err,
                  ),
                );
                setActiveUnshieldToken(null);
              }
            }
          }}
        >
          {children}
        </ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
