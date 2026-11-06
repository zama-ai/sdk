"use client";

// ─── Wallet connection ─────────────────────────────────────────────────────────
// wagmi owns the wallet session in both modes, behind one `useWalletConnection()` hook:
//
// - Dynamic (NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID set): a connect dialog lists the wallets in
//   Dynamic's catalogue — browser wallets and WalletConnect peers, including a Safe paired
//   from the Safe web app. Dynamic only authorizes the wallet (connect-only: no sign-in, no
//   embedded wallet); a wagmi connector of our own wraps its provider, and wagmi persists, restores and follows the connection from then on.
// - Injected (environment ID unset): plain wagmi with the `injected()` connector. Needs no
//   Dynamic account and is what the Playwright suite runs against with a mocked
//   `window.ethereum`.
//
// Either way the rest of the app only talks to wagmi (`useConnection`, `useSwitchChain`, …)
// and the Zama SDK's wagmi adapter, so the FHE flows are identical in both modes.
import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createConfig,
  createStorage,
  http,
  useConnect,
  useConnection,
  useDisconnect,
  WagmiProvider,
  type CreateConnectorFn,
} from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { ConnectWalletDialog, type ConnectState } from "@/components/ConnectWalletDialog";
import { DYNAMIC_ENVIRONMENT_ID, getDynamic } from "@/lib/dynamic";
import { dynamicConnector, readSavedWallet } from "@/lib/dynamicConnector";
import { NETWORK_KEYS, networks } from "@/lib/networks";

// Stable module-level references — recreating on re-render would reset wagmi's state.
// Every row of the network table is registered; the picker decides which ones are offered.
// Destructuring gives the non-empty tuple type the config requires.
const [firstChain, ...otherChains] = NETWORK_KEYS.map((key) => networks[key].chain);
const chains = [firstChain, ...otherChains] as const;
const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
);

const isBrowser = typeof window !== "undefined";
const storage = createStorage({ storage: isBrowser ? window.localStorage : undefined });

// wagmi only reconnects the connectors its config starts with, so the wallet Dynamic last
// connected is listed up front. Other wallets get a connector when the user picks them.
const savedWallet =
  DYNAMIC_ENVIRONMENT_ID && isBrowser
    ? readSavedWallet(window.localStorage, storage.key)
    : undefined;

const connectors: CreateConnectorFn[] = DYNAMIC_ENVIRONMENT_ID
  ? savedWallet
    ? [dynamicConnector(getDynamic().wallets, savedWallet) as CreateConnectorFn]
    : []
  : [injected()];

// The page is server-rendered as disconnected. Without `ssr`, wagmi restores a stored
// connection synchronously on the client's first render and React reports a hydration
// mismatch; with it, the restore runs after mount.
export const wagmiConfig = createConfig({
  chains,
  transports,
  storage,
  connectors,
  ssr: true,
  // Dynamic owns the wallet catalogue, so wagmi discovers nothing itself.
  multiInjectedProviderDiscovery: !DYNAMIC_ENVIRONMENT_ID,
});

const queryClient = new QueryClient();

export interface WalletConnection {
  /** Opens the wallet picker (Dynamic) or prompts the injected wallet. */
  connect: () => void;
  disconnect: () => void;
  /** A connect attempt is open, or wagmi is restoring a previous session. */
  isConnecting: boolean;
  isDisconnecting: boolean;
  connectError: Error | null;
}

const WalletConnectionContext = createContext<WalletConnection | null>(null);

export function useWalletConnection(): WalletConnection {
  const ctx = useContext(WalletConnectionContext);
  if (!ctx) throw new Error("useWalletConnection must be used within <WalletProviders>");
  return ctx;
}

function InjectedWalletConnection({ children }: { children: ReactNode }) {
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnect();
  const value: WalletConnection = {
    connect: () => connect({ connector: injected() }),
    disconnect: () => disconnect({}),
    isConnecting,
    isDisconnecting,
    connectError,
  };
  return (
    <WalletConnectionContext.Provider value={value}>{children}</WalletConnectionContext.Provider>
  );
}

function DynamicWalletConnection({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectState>({ phase: "closed" });
  const { status } = useConnection();
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnect();
  const value: WalletConnection = {
    connect: () => setState({ phase: "wallets" }),
    disconnect: () => disconnect({}),
    isConnecting: state.phase !== "closed" || status === "reconnecting",
    isDisconnecting,
    // The dialog shows connect failures itself, with Retry.
    connectError: null,
  };
  return (
    <WalletConnectionContext.Provider value={value}>
      {children}
      <ConnectWalletDialog state={state} onStateChange={setState} />
    </WalletConnectionContext.Provider>
  );
}

export function WalletProviders({ children }: { children: ReactNode }) {
  const Connection = DYNAMIC_ENVIRONMENT_ID ? DynamicWalletConnection : InjectedWalletConnection;
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Connection>{children}</Connection>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
