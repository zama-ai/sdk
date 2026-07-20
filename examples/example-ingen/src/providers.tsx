"use client";

import { ingen, INGEN_RPC_URL } from "@/lib/config";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext, indexedDBStorage } from "@zama-fhe/sdk";
import { ingenTestnet } from "@zama-fhe/sdk/chains";
import { useState, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors/injected";

const wagmiConfig = createConfig({
  chains: [ingen],
  connectors: [injected()],
  transports: { [ingen.id]: http(INGEN_RPC_URL) },
});

const zamaIngen = { ...ingenTestnet, network: INGEN_RPC_URL } as const;

const zamaConfig = createZamaConfig({
  wagmiConfig,
  chains: [zamaIngen],
  relayers: { [zamaIngen.id]: cleartext() },
  storage: indexedDBStorage,
  permitStorage: indexedDBStorage,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
