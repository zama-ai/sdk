"use client";

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { polygonAmoy } from "wagmi/chains";
import { injected } from "wagmi/connectors/injected";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { indexedDBStorage } from "@zama-fhe/sdk";
import { type FheChain } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { AMOY_RPC_URL } from "@/lib/config";

// Stable module-level references: recreating on re-render would reset wagmi's state.
const wagmiConfig = createConfig({
  chains: [polygonAmoy],
  connectors: [injected()],
  // AMOY_RPC_URL overrides the default RPC if NEXT_PUBLIC_AMOY_RPC_URL is set.
  transports: { [polygonAmoy.id]: http(AMOY_RPC_URL) },
});

// Polygon Amoy FHE deployment, declared inline.
//
// TODO: replace this literal with `import { polygonAmoy } from "@zama-fhe/sdk/chains"`
// once a published SDK release ships the preset. Examples pin a published version,
// and no released version exports a Polygon Amoy `FheChain` yet.
//
// relayerUrl points at the local Next.js proxy (src/app/api/relayer/[...path]/route.ts)
// so any RELAYER_API_KEY stays server-side. The proxy forwards to the shared public
// testnet relayer, which serves both Sepolia and Polygon Amoy.
const zamaPolygonAmoy = {
  id: 80002,
  gatewayChainId: 10901,
  relayerUrl: "http://localhost:3006/api/relayer",
  network: AMOY_RPC_URL,
  aclContractAddress: "0xD99Cb9Fc3c42c87f2A4A12e8Fd60318d6bDdf985",
  kmsContractAddress: "0xCD1D89E311bce4C8DEa9a0857a0c9A4E153D4041",
  inputVerifierContractAddress: "0x6e5A7D8b0c645467Cba7e62D6624917085118631",
  verifyingContractAddressDecryption: "0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478",
  verifyingContractAddressInputVerification: "0x483b9dE06E4E4C7D35CCf5837A1668487406D955",
  registryAddress: "0xF486c3D4F4562760A43883e72E8D6f6Cf2EFdA94",
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [zamaPolygonAmoy],
  wagmiConfig,
  // web() runs the browser FHE worker and talks to the relayer over HTTP.
  // Polygon Amoy runs the full FHE stack, so cleartext() is not used here.
  relayers: { [zamaPolygonAmoy.id]: web() },
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
