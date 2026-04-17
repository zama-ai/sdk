import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryStorage, ZamaProvider } from "@zama-fhe/react-sdk";
import type { ZamaConfig } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import type { ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { anvil } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { burner } from "@zama-fhe/test-components";
import { HardhatConfig, RelayerWeb } from "@zama-fhe/sdk";
import deployments from "../../../contracts/deployments.json" with { type: "json" };
import { getAddress } from "viem";

const anvilPort = import.meta.env.VITE_ANVIL_PORT || "8545";
const rpcUrl = `http://127.0.0.1:${anvilPort}`;
const mockRelayerPort = import.meta.env.VITE_MOCK_RELAYER_PORT || "4200";
const mockRelayerUrl = `http://127.0.0.1:${mockRelayerPort}`;

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
  chain: {
    ...HardhatConfig,
    relayerUrl: mockRelayerUrl,
    network: rpcUrl,
    chainId: anvil.id,
  },
  threads: 4,
  security: { integrityCheck: false },
});

const storage = new MemoryStorage();

const zamaConfig: ZamaConfig = {
  relayer,
  signer,
  storage,
  sessionStorage: new MemoryStorage(),
  keypairTTL: undefined,
  sessionTTL: undefined,
  registryAddresses: {
    [anvil.id]: getAddress(deployments.wrappersRegistry),
  },
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
