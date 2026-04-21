import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
import { burner } from "@zama-fhe/test-components";
import type { ReactNode } from "react";
import { getAddress } from "viem";
import { createConfig, http, WagmiProvider } from "wagmi";
import { anvil } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import deployments from "../../../contracts/deployments.json" with { type: "json" };

const anvilPort = import.meta.env.VITE_ANVIL_PORT || "8545";
const rpcUrl = `http://127.0.0.1:${anvilPort}`;
const mockRelayerPort = import.meta.env.VITE_MOCK_RELAYER_PORT || "4200";
const mockRelayerUrl = `http://127.0.0.1:${mockRelayerPort}`;

const wagmiConfig = createConfig({
  chains: [anvil],
  connectors: [burner({ rpcUrls: { [anvil.id]: rpcUrl } }), injected()],
  transports: { [anvil.id]: http(rpcUrl) },
});

const zamaConfig = createZamaConfig({
  chains: [hardhat],
  wagmiConfig,
  transports: {
    [anvil.id]: web(
      {
        relayerUrl: mockRelayerUrl,
        network: rpcUrl,
        registryAddress: getAddress(deployments.wrappersRegistry),
      },
      { threads: 4, security: { integrityCheck: false } },
    ),
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
