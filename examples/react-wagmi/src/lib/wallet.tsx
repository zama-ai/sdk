"use client";

// ─── Wallet connection ─────────────────────────────────────────────────────────
// Two interchangeable wallet stacks behind one `useWalletConnection()` hook:
//
// - Privy (NEXT_PUBLIC_PRIVY_APP_ID set): Privy's wallet modal connects injected wallets
//   and WalletConnect peers — including a Safe paired over WalletConnect from the Safe web
//   app — and `@privy-io/wagmi` mirrors the active Privy wallet into wagmi's connection
//   state. Connect-only: no Privy login / SIWE signature, the connected wallet is the session.
// - Injected (app ID unset): plain wagmi with the `injected()` connector. Needs no Privy
//   account and is what the Playwright suite runs against, since Privy replaces wagmi's
//   connector list and cannot be driven by a mocked `window.ethereum`.
//
// Either way the rest of the app only talks to wagmi (`useConnection`, `useSwitchChain`, …)
// and the Zama SDK's wagmi adapter, so the FHE flows are identical in both modes.
import { createContext, useContext, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, useConnect, useDisconnect, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import {
  PrivyProvider,
  useConnectWallet,
  useModalStatus,
  usePrivy,
  useWallets,
  type PrivyClientConfig,
} from "@privy-io/react-auth";
import {
  createConfig as createPrivyWagmiConfig,
  WagmiProvider as PrivyWagmiProvider,
} from "@privy-io/wagmi";
import { NETWORK_KEYS, networks } from "@/lib/networks";

// || not ??: Next.js inlines unset NEXT_PUBLIC_* variables as "" at build time.
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

// Stable module-level references — recreating on re-render would reset wagmi's state.
// Every row of the network table is registered; the picker decides which ones are offered.
// Destructuring gives the non-empty tuple type both configs require.
const [firstChain, ...otherChains] = NETWORK_KEYS.map((key) => networks[key].chain);
const chains = [firstChain, ...otherChains] as const;
const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
);

// The page is server-rendered as disconnected. Without `ssr`, wagmi restores a stored
// connection synchronously on the client's first render and React reports a hydration
// mismatch; with it, the restore runs after mount.
// Privy supplies its own connectors, so its config takes none; wagmi's gets `injected()`.
export const wagmiConfig = PRIVY_APP_ID
  ? createPrivyWagmiConfig({ chains, transports, ssr: true })
  : createConfig({ chains, connectors: [injected()], transports, ssr: true });

const privyConfig: PrivyClientConfig = {
  defaultChain: firstChain,
  supportedChains: [...chains],
  loginMethods: ["wallet"],
  // External wallets only — no Privy embedded wallet is created.
  embeddedWallets: { showWalletUIs: true, ethereum: { createOnLogin: "off" } },
  appearance: {
    walletChainType: "ethereum-only",
    // The WalletConnect entries are what a Safe uses to pair from the Safe web app.
    walletList: [
      "detected_ethereum_wallets",
      "metamask",
      "rabby_wallet",
      "rainbow",
      "coinbase_wallet",
      "wallet_connect",
      "wallet_connect_qr",
    ],
    // Wallets are the only login method, so the modal opens on them directly.
    showWalletLoginFirst: true,
  },
};

const queryClient = new QueryClient();

export interface WalletConnection {
  /** False until the wallet stack has restored any previous session. */
  ready: boolean;
  /** Opens the wallet picker (Privy modal) or prompts the injected wallet. */
  connect: () => void;
  disconnect: () => void;
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
    ready: true,
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

function PrivyWalletConnection({ children }: { children: ReactNode }) {
  const { ready: privyReady } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { isOpen: isModalOpen } = useModalStatus();
  const { connectWallet } = useConnectWallet();
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnect();
  const value: WalletConnection = {
    ready: privyReady && walletsReady,
    connect: () => connectWallet(),
    // wagmi's disconnect alone cannot drop an injected wallet Privy owns, so disconnect
    // on the Privy side as well.
    disconnect: () => {
      for (const wallet of wallets) wallet.disconnect();
      disconnect({});
    },
    isConnecting: isModalOpen,
    isDisconnecting,
    connectError: null,
  };
  return (
    <WalletConnectionContext.Provider value={value}>{children}</WalletConnectionContext.Provider>
  );
}

export function WalletProviders({ children }: { children: ReactNode }) {
  if (PRIVY_APP_ID) {
    // Provider order per Privy's wagmi guide: PrivyProvider > QueryClientProvider > WagmiProvider.
    return (
      <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
        <QueryClientProvider client={queryClient}>
          <PrivyWagmiProvider config={wagmiConfig}>
            <PrivyWalletConnection>{children}</PrivyWalletConnection>
          </PrivyWagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    );
  }
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <InjectedWalletConnection>{children}</InjectedWalletConnection>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
