"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerWeb, ZamaProvider, indexedDBStorage } from "@zama-fhe/react-sdk";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { useMemo, type ReactNode } from "react";

const MAINNET_RPC_URL = process.env.NEXT_PUBLIC_MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const { signer, relayer } = useMemo(() => {
    const signer = new EthersSigner({ ethereum: window.ethereum! });
    const relayer = new RelayerWeb({
      getChainId: () => signer.getChainId(),
      transports: {
        1: {
          network: MAINNET_RPC_URL,
          relayerUrl: "http://localhost:3000/api/relayer",
        },
        11155111: {
          network: SEPOLIA_RPC_URL,
          relayerUrl: "http://localhost:3000/api/relayer",
        },
      },
    });
    return { signer, relayer };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider relayer={relayer} storage={indexedDBStorage} signer={signer}>
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
