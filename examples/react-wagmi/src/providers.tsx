"use client";

import "@/lib/zodJitless";
import { type ReactNode } from "react";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import {
  cleartext,
  IndexedDBStorage,
  indexedDBStorage,
  type RelayerConfig,
  type ZamaConfig,
} from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { ChosenNetworkProvider, useActiveNetwork } from "@/lib/chosenNetwork";
import { NETWORK_KEYS, networkForChain, networks, type NetworkKey } from "@/lib/networks";
import { wagmiConfig, WalletProviders } from "@/lib/wallet";

// Relayer traffic goes through the same-origin Next.js proxy so API keys stay server-side.
// The relayer requires an absolute URL, so resolve the origin at runtime; the SSR
// placeholder never issues requests. Cleartext networks have no relayer at all.
const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

// The SDK stores permits per signer and chain id, so a permit signed for the custom
// environment would be sent to Sepolia's relayer, which rejects its signature. A database
// of its own keeps them apart.
const customEnvStorage = new IndexedDBStorage("CredentialStore-custom");

// The SDK takes one FheChain per chain id, so a config registers the active row and, for
// every other chain, its first row. Picking the other row on a shared chain swaps the config.
const configs = new Map<string, ZamaConfig>();

function zamaConfigFor(active: NetworkKey | undefined): ZamaConfig {
  const keys = NETWORK_KEYS.filter(
    (key) => networkForChain(networks[key].chain.id, active) === key,
  );
  const id = keys.join();
  let config = configs.get(id);
  if (!config) {
    // Destructuring gives the non-empty tuple type the config requires.
    const [firstFheChain, ...otherFheChains] = keys.map((key) => {
      const { fhe, transport } = networks[key];
      return transport === "relayer" ? { ...fhe, relayerUrl: `${origin}/api/relayer/${key}` } : fhe;
    });
    const relayers = Object.fromEntries(
      keys.map((key) => {
        const { chain, transport } = networks[key];
        return [chain.id, transport === "relayer" ? web() : cleartext()];
      }),
    ) as Record<number, RelayerConfig>;
    const storage = keys.includes("sepolia-custom") ? customEnvStorage : indexedDBStorage;
    config = createZamaConfig({
      wagmiConfig,
      chains: [firstFheChain, ...otherFheChains],
      relayers,
      storage,
      permitStorage: storage,
    });
    configs.set(id, config);
  }
  return config;
}

// Stable config per active row — a new config on re-render would reset the SDK.
function ActiveZamaProvider({ children }: { children: ReactNode }) {
  const { activeKey } = useActiveNetwork();
  return <ZamaProvider config={zamaConfigFor(activeKey)}>{children}</ZamaProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProviders>
      <ChosenNetworkProvider>
        <ActiveZamaProvider>{children}</ActiveZamaProvider>
      </ChosenNetworkProvider>
    </WalletProviders>
  );
}
