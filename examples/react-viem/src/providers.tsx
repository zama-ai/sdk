"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerWeb, TokenSDKProvider, indexedDBStorage } from "@zama-fhe/token-react-sdk";
import { ViemSigner } from "@zama-fhe/token-react-sdk/viem";
import type { ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;

export const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const signer = new ViemSigner(walletClient, publicClient);

const relayer = new RelayerWeb({
  getChainId: () => walletClient.getChainId(),
  transports: {
    [sepolia.id]: { network: RPC_URL },
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
