import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryStorage, ZamaProvider } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import type { ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { anvil } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { burner } from "@zama-fhe/test-components";
import { RelayerCleartext, hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import deployments from "../../../contracts/deployments.json" with { type: "json" };
import { getAddress } from "viem";

const anvilPort = import.meta.env.VITE_ANVIL_PORT || "8545";
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

const relayer = new RelayerCleartext({
  ...hardhatCleartextConfig,
  network: rpcUrl,
});

const storage = new MemoryStorage();

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider
          relayer={relayer}
          storage={storage}
          signer={signer}
          registryAddresses={{
            [anvil.id]: getAddress(deployments.wrappersRegistry),
          }}
        >
          {children}
        </ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
