"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { RelayerWeb, indexedDBStorage } from "@zama-fhe/token-react-sdk";
import { WagmiTokenSDKProvider } from "@zama-fhe/token-react-sdk/wagmi";
import type { ReactNode } from "react";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(RPC_URL) },
});

const relayer = new RelayerWeb({
  chainId: sepolia.id,
  transports: {
    [sepolia.id]: { network: RPC_URL },
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <WagmiTokenSDKProvider relayer={relayer} storage={indexedDBStorage}>
          {children}
        </WagmiTokenSDKProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
