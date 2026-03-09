"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerWeb, ZamaProvider, indexedDBStorage } from "@zama-fhe/react-sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { type ReactNode, useMemo } from "react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

const MAINNET_RPC_URL = process.env.NEXT_PUBLIC_MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const { signer, relayer } = useMemo(() => {
    const walletClient = createWalletClient({
      chain: sepolia,
      transport: custom(window.ethereum!),
    });

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL),
    });

    const signer = new ViemSigner({ walletClient, publicClient });

    const relayer = new RelayerWeb({
      getChainId: () => walletClient.getChainId(),
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
