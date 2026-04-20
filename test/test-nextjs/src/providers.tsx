"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { MemoryStorage } from "@zama-fhe/sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import type { ZamaConfig } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
import { hardhatCleartextConfig, RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { burner } from "@zama-fhe/test-components";
import type { ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { anvil } from "wagmi/chains";
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
const storage = new MemoryStorage();
const relayer = new RelayerCleartext({
  ...hardhatCleartextConfig,
  network: rpcUrl,
});

const zamaConfig: ZamaConfig = {
  chains: [hardhat],
  relayer,
  signer,
  storage,
  sessionStorage: new MemoryStorage(),
  keypairTTL: undefined,
  sessionTTL: undefined,
  registryTTL: undefined,
  onEvent: undefined,
};

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
