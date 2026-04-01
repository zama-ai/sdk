"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  ZamaSDKEvents,
  IndexedDBStorage,
  indexedDBStorage,
  savePendingUnshield,
} from "@zama-fhe/react-sdk";
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { HOODI_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { ledgerProvider } from "@/lib/LedgerWebHIDProvider";

// ── What this file does ────────────────────────────────────────────────────────
//
// Wires the three SDK primitives:
//
//   const signer  = new EthersSigner({ ethereum: ledgerProvider });
//   const relayer = new RelayerCleartext({ ...hoodiCleartextConfig, network });
//   <ZamaProvider relayer signer storage sessionStorage>
//
// ledgerProvider is a module-level singleton (LedgerWebHIDProvider.ts) that:
//   - implements EIP-1193 via hw-transport-webhid + hw-app-eth
//   - routes signing to the physical Ledger device
//   - routes reads to the Hoodi JsonRpcProvider
//   - returns [] for eth_accounts until connect() is called (page.tsx owns the
//     connect UI; ZamaProvider mounts immediately on all code paths)
//
// walletKey is incremented on accountsChanged to remount ZamaProvider with a
// fresh EthersSigner bound to the new account.
// ──────────────────────────────────────────────────────────────────────────────

// Separate IndexedDB store for session signatures — prevents the session entry
// from overwriting the encrypted ML-KEM keypair (both use the same internal key).
const sessionDBStorage = new IndexedDBStorage("SessionStore");

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Incremented on accountsChanged → forces EthersSigner useMemo to recreate
  // with the new account. ZamaProvider receives the new signer as a prop without
  // a full subtree remount (key= intentionally not used on ZamaProvider).
  const [walletKey, setWalletKey] = useState(0);

  useEffect(() => {
    const handleAccountsChanged = () => {
      setWalletKey((k) => k + 1);
    };
    ledgerProvider.on("accountsChanged", handleAccountsChanged);
    return () => ledgerProvider.removeListener("accountsChanged", handleAccountsChanged);
  }, []);

  // EthersSigner calls BrowserProvider.getSigner() during initialisation. Before the
  // Ledger connects, eth_requestAccounts returns [] and getSigner() rejects with
  // "no such account". This is expected — EthersSigner re-resolves the account on the
  // next walletKey bump (accountsChanged after connect()). Suppress this specific
  // rejection so the console stays clean before the first connection.
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if ((event.reason as Error | undefined)?.message === "no such account") {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  const relayer = useMemo(
    () => new RelayerCleartext({ ...hoodiCleartextConfig, network: HOODI_RPC_URL }),
    [],
  );

  // EthersSigner is recreated on each walletKey bump so ZamaSDK re-resolves the
  // active account from the provider instead of caching the previous one.
  // NOTE: walletKey is intentionally NOT used as key= on ZamaProvider. Using key=
  // would unmount the entire subtree (including page.tsx) on first connect, resetting
  // address state before connectWithIndex() can set it. Passing a new signer prop is
  // sufficient for ZamaProvider to pick up the new account without a full remount.
  const signer = useMemo(
    () =>
      new EthersSigner({
        // LedgerWebHIDProvider is EIP-1193 compatible but its type is narrower than
        // the Eip1193Provider union that EthersSigner expects (wagmi types vs. ours).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ethereum: ledgerProvider as any,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walletKey],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        relayer={relayer}
        storage={indexedDBStorage}
        sessionStorage={sessionDBStorage}
        signer={signer}
        // Align keypairTTL with sessionTTL (both 30 days) — same rationale as example-hoodi.
        keypairTTL={30 * 24 * 60 * 60}
        onEvent={(event) => {
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
