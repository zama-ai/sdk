"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerWeb, indexedDBStorage } from "@zama-fhe/token-react-sdk";
import { EthersTokenSDKProvider } from "@zama-fhe/token-react-sdk/ethers";
import { BrowserProvider } from "ethers";
import type { ReactNode } from "react";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;

const CHAIN_ID = 11155111; // Sepolia

const relayer = new RelayerWeb({
  chainId: CHAIN_ID,
  transports: {
    [CHAIN_ID]: { network: RPC_URL },
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const provider = new BrowserProvider(window.ethereum!);

  return (
    <QueryClientProvider client={queryClient}>
      <EthersTokenSDKProvider relayer={relayer} storage={indexedDBStorage} provider={provider}>
        {children}
      </EthersTokenSDKProvider>
    </QueryClientProvider>
  );
}
