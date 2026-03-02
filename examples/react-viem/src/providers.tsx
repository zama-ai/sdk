"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerWeb, ZamaProvider, indexedDBStorage } from "@zama-fhe/react-sdk";
import { ViemSigner } from "@zama-fhe/react-sdk/viem";
import { type ReactNode, useEffect, useMemo } from "react";
import { createPublicClient, EIP1193Provider, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

declare global {
  interface Window {
    ethereum: EIP1193Provider;
  }
}

const MAINNET_RPC_URL = process.env.NEXT_PUBLIC_MAINNET_RPC_URL!;
const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const signer = useMemo(
    () =>
      new ViemSigner({
        ethereum: window.ethereum,
        chain: sepolia,
        rpcUrl: SEPOLIA_RPC_URL,
      }),
    [],
  );
  const relayer = useMemo(
    () =>
      new RelayerWeb({
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
      }),
    [],
  );

  useEffect(() => {
    const unsubscribe = signer.subscribe(() => queryClient.invalidateQueries());
    return () => unsubscribe();
  }, [signer]);

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider relayer={relayer} storage={indexedDBStorage} signer={signer}>
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
