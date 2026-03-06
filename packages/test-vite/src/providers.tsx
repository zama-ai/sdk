import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryStorage, RelayerWeb, ZamaProvider, type Address } from "@zama-fhe/react-sdk";
import { ACL_ADDRESS } from "./constants";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { burner } from "@zama-fhe/test-components";

const isHardhat = import.meta.env.VITE_NETWORK === "hardhat";

const wagmiConfig = createConfig({
  chains: [hardhat],
  connectors: isHardhat
    ? [
        burner({
          rpcUrls: {
            [hardhat.id]: hardhat.rpcUrls.default.http[0],
          },
        }),
      ]
    : [injected()],
  transports: {
    [hardhat.id]: http(),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerWeb({
  getChainId: async () => signer.getChainId(),
  transports: {
    [hardhat.id]: {
      network: hardhat.rpcUrls.default.http[0],
    },
  },
  security: { integrityCheck: !isHardhat },
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
          aclAddress={ACL_ADDRESS as Address}
        >
          {children}
        </ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
