"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerWeb, TokenSDKProvider, indexedDBStorage } from "@zama-fhe/token-react-sdk";
import { EthersSigner } from "@zama-fhe/token-react-sdk/ethers";
import { BrowserProvider } from "ethers";
import type { ReactNode } from "react";

const MAINNET_RPC_URL = process.env.NEXT_PUBLIC_MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;

const provider = new BrowserProvider(window.ethereum!);

const signer = new EthersSigner(provider);

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [1]: {
      network: MAINNET_RPC_URL,
      relayerUrl: "http://localhost:3000/api/relayer",
    },
    [11155111]: {
      network: SEPOLIA_RPC_URL,
      relayerUrl: "http://localhost:3000/api/relayer",
    },
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TokenSDKProvider relayer={relayer} storage={indexedDBStorage} signer={signer}>
        {children}
      </TokenSDKProvider>
    </QueryClientProvider>
  );
}
