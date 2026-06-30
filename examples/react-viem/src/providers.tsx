"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaSDKEvents,
  IndexedDBStorage,
  createConfig,
  indexedDBStorage,
  savePendingUnshield,
} from "@zama-fhe/sdk";
import { sepolia as fheSepolia } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { ViemProvider, ViemSigner } from "@zama-fhe/sdk/viem";
import { ZamaProvider } from "@zama-fhe/react-sdk";
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
// This file builds the SDK 3.x config used by ZamaProvider:
//
//   const config = createConfig({ chains, provider, signer, relayers, storage, permitStorage });
//   <ZamaProvider config={config}>
//
// The Sepolia FHE chain preset provides the contract addresses and chain parameters.
// Relayer requests are routed through the local /api/relayer proxy (Next.js API route)
// so that RELAYER_API_KEY stays server-side. The proxy defaults to the public Sepolia
// testnet relayer when RELAYER_URL is not set — no API key required for testnet.
//
// SDK reads use ViemProvider + publicClient and are always available. Wallet writes and
// EIP-712 signing use an optional ViemSigner, created only when an EIP-1193 wallet exists.
//
// When no wallet is installed, the config omits signer. Read-only registry queries still
// work; signer-required operations are gated behind address/isSepolia checks in page.tsx.
//
// Two extra layers handle wallet reactivity:
//
// 1. Separate IndexedDB instances for storage and permitStorage — both use the
//    same internal key; sharing one DB instance can overwrite credential data,
//    forcing re-signing on every balance decrypt.
//
// 2. walletKey + refSeededRef — remounts ZamaProvider on wallet switch with a
//    fresh ViemSigner bound to the new account, while ignoring spurious
//    accountsChanged events some wallets emit before eth_accounts resolves.
//
// See WALKTHROUGH.md §"Architecture at a glance" for the full rationale.
// ──────────────────────────────────────────────────────────────────────────────

// Separate DB from indexedDBStorage — see block comment above for the reason.
const permitDBStorage = new IndexedDBStorage("PermitStore");

export function Providers({ children }: { children: ReactNode }) {
  // Created once per Providers mount — avoids sharing the QueryClient across
  // SSR requests and React Strict Mode double-invocations.
  const [queryClient] = useState(() => new QueryClient());

  // Updated synchronously in accountsChanged (before setWalletKey re-renders) so the
  // next ViemSigner sees the correct accounts immediately.
  const liveAccountsRef = useRef<readonly string[]>([]);

  // Becomes true once the initial eth_accounts call resolves. accountsChanged events
  // that arrive before that point are ignored — some wallets (Phantom, certain MetaMask
  // versions) fire accountsChanged on page load before the async seed completes, which
  // would cause a spurious ZamaProvider remount and force the user to re-sign.
  const refSeededRef = useRef(false);

  // Incremented on wallet switch to remount ZamaProvider with a fresh ViemSigner
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
        // ViemSigner requires walletClient.account to be set — it does not infer the
        // account from the EIP-1193 provider at call time (unlike EthersSigner).
        // Bump walletKey so the signer is recreated with the correct account address.
        // Without this, a wallet already connected on page load would get a signer
        // with no account, and all write operations would throw "WalletClient has no account".
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
    // Remount ZamaProvider on network change so the ViemSigner gets a fresh walletClient
    // bound to the new chain. Also invalidate all cached queries — any data fetched on the
    // previous network is stale (different contracts / balances). The ZamaProvider also
    // invalidates wallet-scoped queries through sdk.onIdentityChange, but this explicit
    // invalidation remains a safety net around the forced remount.
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

  // Build the SDK config. The chain preset supplies contract addresses; only relayerUrl
  // and network are overridden for this app's proxy and RPC endpoint.
  // SEPOLIA_RPC_URL overrides the default RPC if NEXT_PUBLIC_SEPOLIA_RPC_URL is set.
  const zamaConfig = useMemo(() => {
    const ethereum = getEthereumProvider();
    const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });
    const provider = new ViemProvider({ publicClient });
    const zamaSepolia = {
      ...fheSepolia,
      relayerUrl: new URL("/api/relayer", window.location.origin).toString(),
      network: SEPOLIA_RPC_URL,
    } as const;

    let signer: ViemSigner | undefined;

    // ViemSigner.writeContract calls walletClient.account to get the signer address —
    // it does NOT fall back to eth_requestAccounts at call time. The account must be
    // set on the walletClient itself. liveAccountsRef is always up-to-date here because
    // walletKey is bumped synchronously after liveAccountsRef is updated (both in the
    // eth_accounts seed and in handleAccountsChanged).
    //
    // getAddress() normalizes to EIP-55 checksummed format. Lowercase addresses
    // returned by eth_accounts can cause relayer address validation failures —
    // normalization prevents this.
    if (ethereum) {
      const rawAddress = liveAccountsRef.current[0];
      const account = rawAddress ? (getAddress(rawAddress) as Address) : undefined;
      const walletClient = createWalletClient({
        ...(account ? { account } : {}),
        chain: sepolia,
        transport: custom(ethereum),
      });
      signer = new ViemSigner({ walletClient, ethereum });
    }

    return createConfig({
      chains: [zamaSepolia],
      provider,
      signer,
      storage: indexedDBStorage,
      permitStorage: permitDBStorage,
      relayers: { [zamaSepolia.id]: web() },
      onEvent: (event) => {
        // ZamaSDKEvents.UnshieldPhase1Submitted fires after Phase 1 is mined (the SDK
        // awaits the receipt before emitting). Saving here ensures the pending state
        // survives a tab close between Phase 1 completion and Phase 2 completion.
        // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
        // NOTE: indexedDBStorage must be the same instance as the `storage` field above.
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
