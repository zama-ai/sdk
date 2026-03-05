"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryStorage, RelayerWeb, ZamaProvider } from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@zama-fhe/react-sdk/wagmi";
import { useMemo, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { burner } from "@zama-fhe/test-components";

const isHardhat = process.env.NEXT_PUBLIC_NETWORK === "hardhat";

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
const storage = new MemoryStorage();

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  const relayer = useMemo(
    () =>
      new RelayerWeb({
        getChainId: () => signer.getChainId(),
        transports: {
          [hardhat.id]: {
            network: hardhat.rpcUrls.default.http[0],
          },
        },
        threads: Math.min(navigator.hardwareConcurrency ?? 4, 8),
        security: { integrityCheck: !isHardhat },
      }),
    [],
  );

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
