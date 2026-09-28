"use client";

import { zamaZenith, zenith, ZENITH_RPC_URL } from "@/lib/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext, indexedDBStorage } from "@zama-fhe/sdk";
import { type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors/injected";

const wagmiConfig = createConfig({
  chains: [zenith],
  connectors: [injected()],
  transports: { [zenith.id]: http(ZENITH_RPC_URL) },
});

const zamaConfig = createZamaConfig({
  wagmiConfig,
  chains: [zamaZenith],
  relayers: { [zamaZenith.id]: cleartext() },
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
