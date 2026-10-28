"use client";

// ─── Wallet connection ─────────────────────────────────────────────────────────
// Two interchangeable wallet stacks behind one `useWalletConnection()` hook:
//
// - Privy (NEXT_PUBLIC_PRIVY_APP_ID set): Privy's wallet modal connects injected wallets
//   and WalletConnect peers — including a Gnosis Safe paired over WalletConnect — and
//   `@privy-io/wagmi` mirrors the active Privy wallet into wagmi's connection state.
//   Connect-only: no Privy login / SIWE signature, the connected wallet is the session.
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
import { sepolia, SEPOLIA_RPC_URL } from "@/lib/config";

// || not ??: Next.js inlines unset NEXT_PUBLIC_* variables as "" at build time.
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

// Stable module-level references — recreating on re-render would reset wagmi's state.
// SEPOLIA_RPC_URL overrides the default RPC if NEXT_PUBLIC_SEPOLIA_RPC_URL is set.
// Privy supplies its own connectors, so its config takes none; wagmi's gets `injected()`.
export const wagmiConfig = PRIVY_APP_ID
  ? createPrivyWagmiConfig({
      chains: [sepolia],
      transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
    })
  : createConfig({
      chains: [sepolia],
      connectors: [injected()],
      transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
    });

const privyConfig: PrivyClientConfig = {
  defaultChain: sepolia,
  supportedChains: [sepolia],
  loginMethods: ["wallet"],
  // External wallets only — no Privy embedded wallet is created.
  embeddedWallets: { showWalletUIs: true, ethereum: { createOnLogin: "off" } },
  appearance: {
    walletChainType: "ethereum-only",
    // WalletConnect entries are what a Gnosis Safe uses to pair from the Safe web app.
    walletList: [
      "detected_ethereum_wallets",
      "metamask",
      "rabby_wallet",
      "rainbow",
      "coinbase_wallet",
      "wallet_connect",
      "wallet_connect_qr",
    ],
    showWalletLoginFirst: false,
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
  const { mutate: disconnect } = useDisconnect();
  const value: WalletConnection = {
    ready: true,
    connect: () => connect({ connector: injected() }),
    disconnect: () => disconnect({}),
    isConnecting,
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
  const { mutate: disconnect } = useDisconnect();
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
