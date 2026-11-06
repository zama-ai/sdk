"use client";

import { useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, type Address } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { ViemProvider, ViemSigner } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA_RPC_URL, publicClient } from "@/lib/config";

const queryClient = new QueryClient();

// Rendered only in the browser, once a wallet is connected (see page.tsx).
export function Providers({ account, children }: { account: Address; children: ReactNode }) {
  const config = useMemo(() => {
    const ethereum = window.ethereum;
    if (!ethereum) {
      throw new Error("No browser wallet found");
    }
    // Relayer requests go through the /api/relayer proxy, so an API key stays server-side.
    const chain = {
      ...zamaSepolia,
      relayerUrl: `${window.location.origin}/api/relayer`,
      network: SEPOLIA_RPC_URL,
    };
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: custom(ethereum),
    });
    return createConfig({
      chains: [chain],
      provider: new ViemProvider({ publicClient }),
      signer: new ViemSigner({ walletClient, ethereum }),
      relayers: { [chain.id]: web() },
    });
  }, [account]);

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={config}>{children}</ZamaProvider>
    </QueryClientProvider>
  );
}
