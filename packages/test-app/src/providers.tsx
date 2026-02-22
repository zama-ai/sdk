"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryStorage, RelayerWeb, TokenSDKProvider } from "@zama-fhe/token-react-sdk";
import { WagmiSigner } from "@zama-fhe/token-react-sdk/wagmi";
import { type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
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

const signer = new WagmiSigner(wagmiConfig);

const relayer = new RelayerWeb({
  getChainId: async () => signer.getChainId(),
  transports: {
    [hardhat.id]: {
      network: hardhat.rpcUrls.default.http[0],
    },
  },
});

const storage = new MemoryStorage();

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <TokenSDKProvider relayer={relayer} storage={storage} signer={signer}>
          {children}
        </TokenSDKProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
