"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import {
  IndexedDBStorage,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
} from "@zama-fhe/sdk";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";

// ── What this file does ────────────────────────────────────────────────────────
//
// Wires together the SDK configuration every integration needs:
//
//   const zamaConfig = createZamaConfig({
//     chains: [mySepolia],
//     wagmiConfig,
//     relayers: { [mySepolia.id]: web() },
//     storage: indexedDBStorage,
//     sessionStorage: sessionDBStorage,
//   });
//   <ZamaProvider config={zamaConfig}>
//
// wagmiConfig and zamaConfig are at module level — stable references that must not be
// recreated on re-render. The wagmi adapter creates the SDK signer/provider and
// subscribes to wagmi connection changes, so no walletKey remount pattern is needed.
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

function relayerProxyUrl() {
  if (typeof window !== "undefined") {
    return new URL("/api/relayer", window.location.origin).toString();
  }
  return "http://localhost:3000/api/relayer";
}

// Route relayer traffic through the local Next.js proxy so RELAYER_API_KEY stays server-side.
const mySepolia = {
  ...fheSepolia,
  // Relayer SDK validates URLs in a worker without a document base URL, so this
  // must be absolute even though it still targets our same-origin proxy.
  relayerUrl: relayerProxyUrl(),
  network: SEPOLIA_RPC_URL,
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
  storage: indexedDBStorage,
  sessionStorage: sessionDBStorage,
  onEvent: (event) => {
    // ZamaSDKEvents.UnshieldPhase1Submitted fires after Phase 1 is mined (the SDK
    // awaits the receipt before emitting). Saving here ensures the pending state
    // survives a tab close between Phase 1 completion and Phase 2 completion.
    // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
    // NOTE: indexedDBStorage must be the same instance as the `storage` config above.
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
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
