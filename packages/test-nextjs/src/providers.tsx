"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { indexedDBStorage, RelayerWeb, ZamaProvider } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { HardhatConfig } from "@zama-fhe/sdk";
import { burner } from "@zama-fhe/test-components";
import type { ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { anvil, hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const anvilPort = process.env.NEXT_PUBLIC_ANVIL_PORT || "8545";
const rpcUrl = `http://127.0.0.1:${anvilPort}`;

const wagmiConfig = createConfig({
  chains: [anvil],
  connectors: [
    burner({
      rpcUrls: {
        [anvil.id]: rpcUrl,
      },
    }),
    injected(),
  ],
  transports: {
    [anvil.id]: http(rpcUrl),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [anvil.id]: { ...HardhatConfig, network: rpcUrl },
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider relayer={relayer} storage={indexedDBStorage} signer={signer}>
          {children}
        </ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
