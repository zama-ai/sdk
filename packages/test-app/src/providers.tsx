"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayerWeb, MemoryStorage } from "@zama-fhe/token-react-sdk";
import { WagmiConfidentialSDKProvider } from "@zama-fhe/token-react-sdk/wagmi";
import { type ReactNode, useState } from "react";
import { http, createConfig, WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { burner } from "./burner-connector";

const isHardhat = process.env.NEXT_PUBLIC_NETWORK === "hardhat";

const wagmiConfig = createConfig({
  chains: [hardhat],
  connectors: isHardhat
    ? [
        burner({
          rpcUrls: {
            [hardhat.id]: hardhat.rpcUrls.default.http[0],
          },
        }),
      ]
    : [injected()],
  transports: {
    [hardhat.id]: http(),
  },
});

const relayer = new RelayerWeb({
  chainId: hardhat.id,
  transports: {
    [hardhat.id]: {
      network: hardhat.rpcUrls.default.http[0],
    },
  },
});

const storage = new MemoryStorage();

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <WagmiConfidentialSDKProvider relayer={relayer} storage={storage}>
          {children}
        </WagmiConfidentialSDKProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
