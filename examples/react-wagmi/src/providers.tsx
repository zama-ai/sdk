"use client";

import { type ReactNode } from "react";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { indexedDBStorage } from "@zama-fhe/sdk";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { fheChain, SEPOLIA_RPC_URL } from "@/lib/config";
import { wagmiConfig, WalletProviders } from "@/lib/wallet";

// Route relayer traffic through the local Next.js proxy so RELAYER_API_KEY stays server-side.
// The relayer requires an absolute URL, so resolve the same-origin proxy at runtime.
// The SSR placeholder never issues requests.
const relayerProxyUrl =
  typeof window === "undefined"
    ? "http://localhost/api/relayer"
    : `${window.location.origin}/api/relayer`;

// fheChain is the testnet or custom Sepolia config, picked by NEXT_PUBLIC_ZAMA_ENV (lib/config.ts).
const zamaSepolia = {
  ...fheChain,
  relayerUrl: relayerProxyUrl,
  network: SEPOLIA_RPC_URL,
} as const satisfies FheChain;

// Stable module-level reference — recreating on re-render would reset the SDK.
// wagmiConfig is the Privy-managed or plain wagmi config, whichever lib/wallet.ts built.
const zamaConfig = createZamaConfig({
  wagmiConfig,
  chains: [zamaSepolia],
  relayers: { [zamaSepolia.id]: web() },
  storage: indexedDBStorage,
  permitStorage: indexedDBStorage,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProviders>
      <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
    </WalletProviders>
  );
}
