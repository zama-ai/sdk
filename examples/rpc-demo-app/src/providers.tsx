"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { ZAMA_RPC_URL } from "@/lib/config";

// Ordinary wagmi config — no ZamaProvider, no @zama-fhe/react-sdk anywhere in this
// app. The one thing that matters: `transports` points at the zama-json-rpc
// wrapper, not a plain Sepolia node, so every read this page makes (getBalance,
// readContract, ...) flows through it.
//
// This does NOT make MetaMask itself broadcast through the wrapper — an injected
// connector signs+sends via the wallet's own configured RPC for the chain, not via
// this transport (verified: `transports` only backs the public/read client). See
// README.md for the one manual step (pointing MetaMask's Sepolia RPC at the
// wrapper) that makes the write path go through it too.
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(ZAMA_RPC_URL) },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
