"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerWeb, indexedDBStorage } from "@zama-fhe/token-react-sdk";
import { ViemTokenSDKProvider } from "@zama-fhe/token-react-sdk/viem";
import type { ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;

const relayer = new RelayerWeb({
  chainId: sepolia.id,
  transports: {
    [sepolia.id]: { network: RPC_URL },
  },
});

const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ViemTokenSDKProvider
        relayer={relayer}
        storage={indexedDBStorage}
        walletClient={walletClient}
        publicClient={publicClient}
      >
        {children}
      </ViemTokenSDKProvider>
    </QueryClientProvider>
  );
}
