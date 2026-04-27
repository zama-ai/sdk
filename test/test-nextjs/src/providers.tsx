"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext } from "@zama-fhe/sdk";
import { anvil as fheAnvil } from "@zama-fhe/sdk/chains";
import { burner } from "@zama-fhe/test-components";
import type { ReactNode } from "react";
import { getAddress } from "viem";
import { createConfig, http, WagmiProvider } from "wagmi";
import { anvil } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import deployments from "../../../contracts/deployments.json" with { type: "json" };

const anvilPort = process.env.NEXT_PUBLIC_ANVIL_PORT || "8545";
const rpcUrl = `http://127.0.0.1:${anvilPort}`;

const wagmiConfig = createConfig({
  chains: [anvil],
  connectors: [burner({ rpcUrls: { [anvil.id]: rpcUrl } }), injected()],
  transports: { [anvil.id]: http(rpcUrl) },
});

const zamaConfig = createZamaConfig({
  chains: [fheAnvil],
  wagmiConfig,
  transports: {
    [anvil.id]: cleartext({
      network: rpcUrl,
      registryAddress: getAddress(deployments.wrappersRegistry),
    }),
  },
});

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
