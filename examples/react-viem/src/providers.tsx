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
import { createConfig as createZamaConfig } from "@zama-fhe/sdk/viem";
import { sepolia as fheSepolia } from "@zama-fhe/sdk/chains";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  getAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// This file creates a ZamaConfig using the viem adapter path and passes it
// to ZamaProvider. The config encapsulates signer, provider, relayer, and
// storage — no manual wiring needed:
//
//   const zamaConfig = createZamaConfig({
//     chains: [fheSepolia],
//     publicClient,
//     walletClient,
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
//    fresh config containing new viem clients bound to the new account, while
//    ignoring spurious accountsChanged events some wallets emit before
//    eth_accounts resolves.
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
  // next walletClient creation sees the correct accounts immediately.
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
        // The viem walletClient requires account to be set explicitly — it does not infer
        // the account from the EIP-1193 provider at call time (unlike ethers).
        // Bump walletKey so the config is recreated with the correct account address.
        // Without this, a wallet already connected on page load would get a walletClient
        // with no account, and all write operations would throw.
        if (accounts.length > 0) {
          setWalletKey((k) => k + 1);
        }
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
    // Remount ZamaProvider on network change so the config gets fresh viem clients
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

  // Recreated on walletKey change — produces a fresh config with publicClient,
  // walletClient, and relayer wired to the current wallet account and chain.
  const zamaConfig = useMemo(() => {
    const ethereum = getEthereumProvider();
    // publicClient is always created (needed for reads even without a wallet).
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL),
    });

    // walletClient is only created when window.ethereum is available. The account must
    // be set on the walletClient itself — viem does NOT fall back to eth_requestAccounts
    // at call time. liveAccountsRef is always up-to-date here because walletKey is bumped
    // synchronously after liveAccountsRef is updated (both in the eth_accounts seed and
    // in handleAccountsChanged).
    //
    // getAddress() normalizes to EIP-55 checksummed format. Lowercase addresses
    // returned by eth_accounts can cause relayer address validation failures —
    // normalization prevents this.
    const rawAddress = liveAccountsRef.current[0];
    const account = rawAddress ? (getAddress(rawAddress) as Address) : undefined;
    const walletClient = ethereum
      ? createWalletClient({
          ...(account ? { account } : {}),
          chain: sepolia,
          transport: custom(ethereum),
        })
      : undefined;

    return createZamaConfig({
      chains: [fheSepolia],
      publicClient,
      walletClient,
      ethereum: ethereum ?? undefined,
      transports: {
        [fheSepolia.id]: web({
          relayerUrl: `${window.location.origin}/api/relayer`,
          network: SEPOLIA_RPC_URL,
        }),
      },
      // ZamaSDKEvents.UnshieldPhase1Submitted fires after Phase 1 is mined (the SDK
      // awaits the receipt before emitting). Saving here ensures the pending state
      // survives a tab close between Phase 1 completion and Phase 2 completion.
      // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
      // NOTE: indexedDBStorage must be the same instance used internally by createZamaConfig.
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
  }, [walletKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider key={walletKey} config={zamaConfig}>
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
