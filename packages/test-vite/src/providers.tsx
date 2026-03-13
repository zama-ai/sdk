import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryStorage, ZamaProvider } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { burner } from "@zama-fhe/test-components";
import { RelayerCleartext, hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";

const wagmiConfig = createConfig({
  chains: [hardhat],
  connectors: [
    burner({
      rpcUrls: {
        [hardhat.id]: hardhat.rpcUrls.default.http[0],
      },
    }),
    injected(),
  ],
  transports: {
    [hardhat.id]: http(),
  },
});

const signer = new WagmiSigner({ config: wagmiConfig });

const relayer = new RelayerCleartext(hardhatCleartextConfig);

const storage = new MemoryStorage();

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ZamaProvider relayer={relayer} storage={storage} signer={signer}>
          {children}
        </ZamaProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
