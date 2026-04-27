"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  ZamaSDKEvents,
  IndexedDBStorage,
  indexedDBStorage,
  savePendingUnshield,
  RelayerWeb,
} from "@zama-fhe/react-sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { SepoliaConfig } from "@zama-fhe/sdk";
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
// This file wires together the three SDK primitives every integration needs:
//
//   const signer  = new ViemSigner({ walletClient, publicClient });
//   const relayer = new RelayerWeb({ getChainId, transports: { [SepoliaConfig.chainId]: ... } });
//   <ZamaProvider relayer={relayer} signer={signer}
//     storage={indexedDBStorage} sessionStorage={sessionDBStorage}>
//
// SepoliaConfig (from @zama-fhe/sdk) provides the contract addresses and chain parameters.
// Relayer requests are routed through the local /api/relayer proxy (Next.js API route)
// so that RELAYER_API_KEY stays server-side. The proxy defaults to the public Sepolia
// testnet relayer when RELAYER_URL is not set — no API key required for testnet.
//
// ViemSigner is constructed with two clients:
// - publicClient: for read operations (balances, metadata, receipts) — always available
// - walletClient: for write operations (send tx, sign) — only when a wallet is installed
//
// When no wallet is installed, ViemSigner is constructed with publicClient only (read-only).
// useConfidentialBalance catches getAddress() rejections gracefully; all write operations
// are gated behind address/isSepolia checks in page.tsx and are never called.
//
// Two extra layers handle wallet reactivity:
//
// 1. Separate IndexedDB instances for storage and sessionStorage — both use the
//    same internal key; sharing one DB instance causes the session entry to
//    overwrite the encrypted keypair, forcing re-signing on every balance decrypt.
//
// 2. walletKey + refSeededRef — remounts ZamaProvider on wallet switch with a
//    fresh ViemSigner bound to the new account, while ignoring spurious
//    accountsChanged events some wallets emit before eth_accounts resolves.
//
// See WALKTHROUGH.md §"Architecture at a glance" for the full rationale.
// ──────────────────────────────────────────────────────────────────────────────

// Separate DB from indexedDBStorage — see block comment above for the reason.
const sessionDBStorage = new IndexedDBStorage("SessionStore");

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

  // RelayerWeb routes through the local /api/relayer proxy so RELAYER_API_KEY stays
  // server-side. SepoliaConfig supplies the contract addresses and chain parameters;
  // only relayerUrl is overridden to point at the proxy.
  // SEPOLIA_RPC_URL overrides the default RPC if NEXT_PUBLIC_SEPOLIA_RPC_URL is set.
  // getChainId reads window.ethereum directly (not via walletClient, which would be a
  // stale closure after walletKey remounts).
  const relayer = useMemo(
    () =>
      new RelayerWeb({
        getChainId: async () => {
          const ethereum = getEthereumProvider();
          if (!ethereum) return SepoliaConfig.chainId;
          try {
            const hex = (await ethereum.request({ method: "eth_chainId" })) as string;
            return parseInt(hex, 16);
          } catch (err) {
            console.error("[RelayerWeb] getChainId failed, falling back to Sepolia:", err);
            return SepoliaConfig.chainId;
          }
        },
        transports: {
          [SepoliaConfig.chainId]: {
            ...SepoliaConfig,
            relayerUrl: `${window.location.origin}/api/relayer`,
            network: SEPOLIA_RPC_URL,
          },
        },
      }),
    [],
  );

  // Recreated on wallet switch so the new ViemSigner is bound to the new account address.
  // publicClient is always created (needed for reads even without a wallet).
  // walletClient is only created when window.ethereum is available.
  const signer = useMemo(() => {
    const ethereum = getEthereumProvider();
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL),
    });
    if (!ethereum) {
      // No wallet installed — read-only signer. ViemSigner handles getAddress() rejections
      // gracefully: useConfidentialBalance catches the error; write operations are gated
      // behind address/isSepolia checks in page.tsx and will never be called.
      return new ViemSigner({ publicClient });
    }
    // ViemSigner.writeContract calls walletClient.account to get the signer address —
    // it does NOT fall back to eth_requestAccounts at call time. The account must be
    // set on the walletClient itself. liveAccountsRef is always up-to-date here because
    // walletKey is bumped synchronously after liveAccountsRef is updated (both in the
    // eth_accounts seed and in handleAccountsChanged).
    //
    // getAddress() normalizes to EIP-55 checksummed format. Lowercase addresses
    // returned by eth_accounts can cause relayer address validation failures —
    // normalization prevents this.
    const rawAddress = liveAccountsRef.current[0];
    const account = rawAddress ? (getAddress(rawAddress) as Address) : undefined;
    const walletClient = createWalletClient({
      ...(account ? { account } : {}),
      chain: sepolia,
      transport: custom(ethereum),
    });
    return new ViemSigner({ walletClient, publicClient });
  }, [walletKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        key={walletKey}
        relayer={relayer}
        storage={indexedDBStorage}
        sessionStorage={sessionDBStorage}
        signer={signer}
        onEvent={(event) => {
          // ZamaSDKEvents.UnshieldPhase1Submitted fires after Phase 1 is mined (the SDK
          // awaits the receipt before emitting). Saving here ensures the pending state
          // survives a tab close between Phase 1 completion and Phase 2 completion.
          // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
          // NOTE: indexedDBStorage must be the same instance as the `storage` prop above.
          if (event.type === ZamaSDKEvents.UnshieldPhase1Submitted) {
            const wrapperAddress = getActiveUnshieldToken();
            if (wrapperAddress) {
              savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash).catch((err) =>
                console.error("[Providers] Failed to persist pending unshield:", event.txHash, err),
              );
              setActiveUnshieldToken(null);
            }
          }
        }}
      >
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
