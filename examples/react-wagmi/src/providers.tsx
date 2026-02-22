"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { RelayerWeb, TokenSDKProvider, indexedDBStorage } from "@zama-fhe/token-react-sdk";
import { WagmiSigner } from "@zama-fhe/token-react-sdk/wagmi";
import type { ReactNode } from "react";

const MAINNET_RPC_URL = process.env.NEXT_PUBLIC_MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  connectors: [injected()],
  transports: { [mainnet.id]: http(MAINNET_RPC_URL), [sepolia.id]: http(SEPOLIA_RPC_URL) },
});

const signer = new WagmiSigner(wagmiConfig);

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [mainnet.id]: {
      network: MAINNET_RPC_URL,
      relayerUrl: "http://localhost:3000/api/relayer",
    },
    [sepolia.id]: {
      network: SEPOLIA_RPC_URL,
      relayerUrl: "http://localhost:3000/api/relayer",
    },
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <TokenSDKProvider relayer={relayer} storage={indexedDBStorage} signer={signer}>
          {children}
        </TokenSDKProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
