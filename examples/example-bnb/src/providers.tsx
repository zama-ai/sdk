"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors/injected";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext, indexedDBStorage } from "@zama-fhe/sdk";
import { bscTestnet as fheBscTestnet } from "@zama-fhe/sdk/chains";
import { BSC_TESTNET_RPC_URL } from "@/lib/config";

const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: { [bscTestnet.id]: http(BSC_TESTNET_RPC_URL) },
});

const zamaBscTestnet = { ...fheBscTestnet, network: BSC_TESTNET_RPC_URL } as const;

const zamaConfig = createZamaConfig({
  chains: [zamaBscTestnet],
  wagmiConfig,
  relayers: { [zamaBscTestnet.id]: cleartext() },
  storage: indexedDBStorage,
  permitStorage: indexedDBStorage,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
