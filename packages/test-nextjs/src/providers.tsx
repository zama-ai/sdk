"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { indexedDBStorage, RelayerWeb, ZamaProvider } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { HardhatConfig } from "@zama-fhe/sdk";
import { burner } from "@zama-fhe/test-components";
import type { ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const wagmiConfig = createConfig({
  chains: [hardhat],
  connectors: [
    burner({
      rpcUrls: {
        [hardhat.id]: hardhat.rpcUrls.default.http[0],
      },
    }),
    injected(),
  ],
  transports: {
    [hardhat.id]: http(),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [hardhat.id]: HardhatConfig,
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
