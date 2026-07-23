"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hoodi } from "wagmi/chains";
import { injected } from "wagmi/connectors/injected";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext, indexedDBStorage } from "@zama-fhe/sdk";
import { hoodi as fheHoodi } from "@zama-fhe/sdk/chains";
import { HOODI_RPC_URL } from "@/lib/config";

const wagmiConfig = createConfig({
  chains: [hoodi],
  connectors: [injected()],
  transports: { [hoodi.id]: http(HOODI_RPC_URL) },
});

const zamaHoodi = { ...fheHoodi, network: HOODI_RPC_URL } as const;

const zamaConfig = createZamaConfig({
  chains: [zamaHoodi],
  wagmiConfig,
  relayers: { [zamaHoodi.id]: cleartext() },
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
