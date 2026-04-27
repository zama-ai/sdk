"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
  web,
} from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/sdk/ethers";
import { sepolia as fheSepolia } from "@zama-fhe/sdk/chains";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// This file creates a ZamaConfig using the ethers adapter path and passes it
// to ZamaProvider. The config encapsulates signer, provider, relayer, and
// storage — no manual wiring needed:
//
//   const zamaConfig = createZamaConfig({
//     chains: [fheSepolia],
//     ethereum,
//     transports: { [fheSepolia.id]: web({ relayerUrl, network }) },
//   });
//   <ZamaProvider config={zamaConfig}>
//
// fheSepolia (from @zama-fhe/sdk/chains) provides the FHE contract addresses
// and chain parameters. Relayer requests are routed through the local
// /api/relayer proxy (Next.js API route) so that RELAYER_API_KEY stays
// server-side. The proxy defaults to the public Sepolia testnet relayer
// when RELAYER_URL is not set — no API key required for testnet.
//
// Storage note: the old manual wiring required two separate IndexedDB instances
// (storage + sessionStorage) because both used the same internal key. createZamaConfig
// handles storage internally — no manual IndexedDB setup needed.
//
// Two extra layers handle wallet reactivity:
//
// 1. walletKey + refSeededRef — remounts ZamaProvider on wallet switch with a
//    fresh config bound to the new account, while ignoring spurious
//    accountsChanged events some wallets emit before eth_accounts resolves.
//
// 2. handleChainChanged — remounts on chain switch and invalidates React Query
//    cache so balances and token data refetch for the new chain.
//
// See WALKTHROUGH.md §"Architecture at a glance" for the full rationale.
// ──────────────────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  // Created once per Providers mount — avoids sharing the QueryClient across
  // SSR requests and React Strict Mode double-invocations.
  const [queryClient] = useState(() => new QueryClient());

  // Updated synchronously in accountsChanged (before setWalletKey re-renders) so the
  // next config creation sees the correct accounts immediately.
  const liveAccountsRef = useRef<readonly string[]>([]);

  // Becomes true once the initial eth_accounts call resolves. accountsChanged events
  // that arrive before that point are ignored — some wallets (Phantom, certain MetaMask
  // versions) fire accountsChanged on page load before the async seed completes, which
  // would cause a spurious ZamaProvider remount and force the user to re-sign.
  const refSeededRef = useRef(false);

  // Incremented on wallet switch to remount ZamaProvider with a fresh config
  // bound to the new account.
  const [walletKey, setWalletKey] = useState(0);

  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    // Seed the ref for already-connected wallets on page load.
    (ethereum.request({ method: "eth_accounts" }) as Promise<string[]>).then(
      (accounts) => {
        liveAccountsRef.current = accounts;
        refSeededRef.current = true;
      },
      (err) => {
        console.error("[Providers] Failed to seed accounts:", err);
        refSeededRef.current = true;
      },
    );
    const handleAccountsChanged = (accounts: unknown) => {
      const newAccounts = accounts as string[];
      const prevAddress = liveAccountsRef.current[0];
      liveAccountsRef.current = newAccounts;
      // Drop events that arrive before eth_accounts resolves — prevents spurious remounts.
      if (!refSeededRef.current) return;
      // Remount on any actual account change, including first connection (prevAddress = undefined).
      if (newAccounts[0] !== prevAddress) {
        setWalletKey((k) => k + 1);
      }
    };
    // Remount ZamaProvider on network change so the config gets a fresh provider
    // bound to the new chain. Also invalidate all cached queries — any data fetched on the
    // previous network is stale (different contracts / balances). The ZamaProvider's internal
    // signerLifecycleCallbacks.onChainChange already calls invalidateWalletLifecycleQueries,
    // but that path can hang if the SDK's initial setup (getAddress via eth_requestAccounts)
    // is still pending. The explicit invalidation here acts as a safety net.
    const handleChainChanged = () => {
      setWalletKey((k) => k + 1);
      queryClient.invalidateQueries();
    };
    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [queryClient]);

  // Recreated on walletKey change — produces a fresh config with signer,
  // provider, and relayer wired to the current wallet account and chain.
  const zamaConfig = useMemo(() => {
    const ethereum = getEthereumProvider();
    // createZamaConfig (ethers path) requires a non-null EIP-1193 provider — it throws
    // on undefined/null. When no wallet is installed, use a stub provider that throws a
    // descriptive error. All SDK operations in page.tsx are gated behind address/isSepolia
    // checks so this config is never actually used until the user connects a wallet.
    const provider = ethereum ?? {
      request: async () => {
        throw new Error("No Ethereum wallet detected. Connect a wallet to use this app.");
      },
      on: () => {},
      removeListener: () => {},
    };

    return createZamaConfig({
      chains: [fheSepolia],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ethereum: provider as any,
      transports: {
        [fheSepolia.id]: web({
          relayerUrl: `${window.location.origin}/api/relayer`,
          network: SEPOLIA_RPC_URL,
        }),
      },
      // ZamaSDKEvents.UnshieldPhase1Submitted fires after Phase 1 is mined (the SDK awaits
      // the receipt before emitting). Saving here ensures the pending state survives a tab
      // close between Phase 1 completion and Phase 2 completion.
      // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
      //
      // NOTE: indexedDBStorage here is the same instance used internally by createZamaConfig
      // for storage. savePendingUnshield writes the pending tx hash into that store;
      // PendingUnshieldCard reads it back via useZamaSDK().storage (which resolves to the
      // same singleton). They must always point to the same underlying store.
      onEvent: (event) => {
        if (event.type === ZamaSDKEvents.UnshieldPhase1Submitted) {
          const wrapperAddress = getActiveUnshieldToken();
          if (wrapperAddress) {
            savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash).catch((err) =>
              console.error("[Providers] Failed to persist pending unshield:", event.txHash, err),
            );
            setActiveUnshieldToken(null);
          }
        }
      },
    });
  }, [walletKey]);

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider key={walletKey} config={zamaConfig}>
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
