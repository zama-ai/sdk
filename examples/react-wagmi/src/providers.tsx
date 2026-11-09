"use client";

import { type ReactNode } from "react";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext, indexedDBStorage, type RelayerConfig } from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { NETWORK_KEYS, networks } from "@/lib/networks";
import { wagmiConfig, WalletProviders } from "@/lib/wallet";

// Relayer traffic goes through the same-origin Next.js proxy so API keys stay server-side.
// The relayer requires an absolute URL, so resolve the origin at runtime; the SSR
// placeholder never issues requests. Cleartext networks have no relayer at all.
const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

// Every row of the network table is registered; the picker decides which ones are offered.
// Destructuring gives the non-empty tuple type the config requires.
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

// Stable module-level reference — recreating on re-render would reset the SDK.
// wagmiConfig is the Privy-managed or plain wagmi config, whichever lib/wallet.tsx built.
const zamaConfig = createZamaConfig({
  wagmiConfig,
  chains: fheChains,
  relayers,
  storage: indexedDBStorage,
  permitStorage: indexedDBStorage,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProviders>
      <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
    </WalletProviders>
  );
}
