"use client";

import "@/lib/zodJitless";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import {
  cleartext,
  type GenericStorage,
  IndexedDBStorage,
  indexedDBStorage,
  type RelayerConfig,
  type ZamaConfig,
} from "@zama-fhe/sdk";
import { web } from "@zama-fhe/sdk/web";
import { type Environment, fheFor, isCustomized, networkId } from "@/lib/environment";
import { NETWORK_KEYS, networks } from "@/lib/networks";
import { wagmiConfig, WalletProviders } from "@/lib/wallet";

// Relayer traffic goes through the same-origin Next.js proxy so API keys stay server-side.
// The relayer requires an absolute URL, so resolve the origin at runtime; the SSR
// placeholder never issues requests. Cleartext networks have no relayer at all.
const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

const relayers = Object.fromEntries(
  NETWORK_KEYS.map((key) => {
    const { chain, transport } = networks[key];
    return [chain.id, transport === "relayer" ? web() : cleartext()];
  }),
) as Record<number, RelayerConfig>;

function createConfig(env: Environment, storage: GenericStorage): ZamaConfig {
  // Every row of the network table is registered; the picker decides which ones are offered.
  // Destructuring gives the non-empty tuple type the config requires.
  const [firstFheChain, ...otherFheChains] = NETWORK_KEYS.map((key) => {
    const fhe = fheFor(key, env);
    return networks[key].transport === "relayer"
      ? { ...fhe, relayerUrl: `${origin}/api/relayer/${networkId(key, env)}` }
      : fhe;
  });
  return createZamaConfig({
    wagmiConfig,
    chains: [firstFheChain, ...otherFheChains],
    relayers,
    storage,
    permitStorage: storage,
  });
}

// Module-level: recreating a config on re-render resets the SDK. The custom one has its own
// database because permits are keyed by signer and chain ID, which both environments share.
// When it changes no network it would equal the default config, so it reuses that.
const defaultConfig = createConfig("default", indexedDBStorage);
const configs: Record<Environment, ZamaConfig> = {
  default: defaultConfig,
  custom: NETWORK_KEYS.some(isCustomized)
    ? createConfig("custom", new IndexedDBStorage("CredentialStore-custom"))
    : defaultConfig,
};

const EnvironmentContext = createContext<{
  env: Environment;
  setEnv: (env: Environment) => void;
} | null>(null);

/** The Zama environment the SDK runs against, picked together with the network. */
export function useEnvironment() {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error("useEnvironment must be used within <Providers>");
  return ctx;
}

function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [env, setEnv] = useState<Environment>("default");
  const value = useMemo(() => ({ env, setEnv }), [env]);
  return (
    <EnvironmentContext.Provider value={value}>
      <ZamaProvider config={configs[env]}>{children}</ZamaProvider>
    </EnvironmentContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProviders>
      <EnvironmentProvider>{children}</EnvironmentProvider>
    </WalletProviders>
  );
}
