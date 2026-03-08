"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createFhevmConfig, FhevmProvider, MemoryStorage } from "@zama-fhe/react-sdk";
import { wagmiAdapter } from "@zama-fhe/react-sdk/wagmi";
import { fhevmHardhat } from "@zama-fhe/sdk/chains";
import { type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { burner } from "@zama-fhe/test-components";

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

const storage = new MemoryStorage();
const fhevmConfig = createFhevmConfig({
  chains: [fhevmHardhat],
  wallet: wagmiAdapter(),
  storage,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <FhevmProvider config={fhevmConfig}>{children}</FhevmProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
