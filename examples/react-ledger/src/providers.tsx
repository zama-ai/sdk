"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
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
import { JsonRpcProvider } from "ethers";
import { HOODI_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { notifyProviderDiscovered, type EIP1193Provider } from "@/lib/ledgerProvider";

// ── What this file does ────────────────────────────────────────────────────────
//
// This file wires together the three SDK primitives every integration needs:
//
//   const signer  = new EthersSigner({ ethereum: hybridProvider });
//   const relayer = new RelayerCleartext({ ...hoodiCleartextConfig, network: HOODI_RPC_URL });
//   <ZamaProvider relayer={relayer} signer={signer}
//     storage={indexedDBStorage} sessionStorage={sessionDBStorage}>
//
// Ledger Button specifics handled here:
//
// 1. Dynamic import of @ledgerhq/ledger-wallet-provider — the library accesses
//    window/document at import time, so it must never be imported at module level
//    in a Next.js app (SSR would crash). It is loaded inside a useEffect.
//
// 2. EIP-6963 discovery — the Ledger Button does NOT inject window.ethereum.
//    Instead it announces itself via eip6963:announceProvider. We listen for
//    that event and filter by rdns = "com.ledger".
//
// 3. Hybrid provider — the Ledger Button only forwards 5 read-only methods to
//    its own node (which doesn't serve Hoodi). All other reads (nonce, receipts,
//    block polling, logs) are routed to our direct Hoodi JsonRpcProvider. Only
//    signing and account methods go to the Ledger Button.
//
// 4. notifyProviderDiscovered — stores the raw Ledger Button provider in a
//    module-level singleton (ledgerProvider.ts) so page.tsx can access it for
//    the connect / chain-check UI without a React context.
// ──────────────────────────────────────────────────────────────────────────────

// Separate IndexedDB store for session signatures — same reason as example-hoodi:
// both credentials and session use the same internal key; separate DBs prevent
// the session entry from overwriting the encrypted ML-KEM keypair.
const sessionDBStorage = new IndexedDBStorage("SessionStore");

/**
 * RPC methods that must be handled by the Ledger Button provider (device signing,
 * account management, chain ID). Everything else — reads, nonce, receipt polling,
 * block number, gas estimates — goes to our direct Hoodi JsonRpcProvider.
 *
 * Note: wallet_* methods are also routed to the Ledger Button, but
 * wallet_switchEthereumChain will always fail for Hoodi (not in its chain list).
 * page.tsx removes the chain-switch UI so this never gets called in practice.
 */
const LEDGER_METHODS = new Set([
  "eth_accounts",
  "eth_requestAccounts",
  "eth_chainId",
  "eth_sign",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_signRawTransaction",
  "eth_sendRawTransaction",
]);

/**
 * Hybrid EIP-1193 provider:
 * - Signing / account methods → Ledger Button
 * - Everything else (eth_call, eth_estimateGas, eth_getTransactionCount,
 *   eth_getTransactionReceipt, eth_blockNumber, eth_getLogs, …) → direct Hoodi RPC
 *
 * eth_blockNumber is served by our RPC and adjusted with a high-water mark so
 * the value is always strictly increasing — ethers' PollingBlockSubscriber only
 * triggers receipt checks on new blocks, so without this receipts would only be
 * checked once per ~12 s block time instead of every poll interval.
 */
function createHybridProvider(
  ledger: EIP1193Provider,
  liveAccountsRef: { readonly current: readonly string[] },
) {
  const rpcProvider = new JsonRpcProvider(HOODI_RPC_URL);
  let highWaterBlock = 0n;

  return {
    request({ method, params }: { method: string; params?: unknown[] }) {
      // Account queries: serve from cache so EthersSigner resolves without a
      // round-trip and avoids triggering an unexpected Ledger Button popup.
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        if (liveAccountsRef.current.length > 0) {
          return Promise.resolve([...liveAccountsRef.current]);
        }
        return ledger.request({ method: "eth_accounts", params: [] });
      }

      if (LEDGER_METHODS.has(method) || method.startsWith("wallet_")) {
        return ledger.request({ method, params });
      }

      // eth_blockNumber: always via our RPC, but monotonically increasing.
      if (method === "eth_blockNumber") {
        return rpcProvider.send(method, params ?? []).then((block: unknown) => {
          const actual = BigInt(block as string);
          if (actual > highWaterBlock) highWaterBlock = actual;
          else highWaterBlock += 1n;
          return `0x${highWaterBlock.toString(16)}`;
        });
      }

      return rpcProvider.send(method, params ?? []);
    },
    on: (event: string, handler: (...args: unknown[]) => void) => ledger.on(event, handler),
    removeListener: (event: string, handler: (...args: unknown[]) => void) =>
      ledger.removeListener(event, handler),
  };
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Set to the Ledger Button EIP-1193 provider once EIP-6963 announces it.
  // ZamaProvider is not rendered until this is non-null.
  const [ledgerProvider, setLedgerProvider] = useState<EIP1193Provider | null>(null);

  // Incremented when the user switches accounts — remounts ZamaProvider with
  // a fresh EthersSigner bound to the new account.
  const [walletKey, setWalletKey] = useState(0);

  // Updated synchronously in accountsChanged before setWalletKey re-renders,
  // so the next EthersSigner sees the correct accounts immediately.
  const liveAccountsRef = useRef<readonly string[]>([]);
  const refSeededRef = useRef(false);

  useEffect(() => {
    // ── Dynamic import ────────────────────────────────────────────────────────
    // @ledgerhq/ledger-wallet-provider accesses window/document at import time.
    // This must run client-side only (inside useEffect).
    import("@ledgerhq/ledger-wallet-provider")
      .then(({ initializeLedgerProvider }) => {
        // Mount the Ledger Button floating widget and register the EIP-6963 provider.
        // No apiKey: the library uses its own hardcoded development fallback token.
        // For production, enrol at https://tally.so/r/wzaAVa to obtain a real key.
        const cleanup = initializeLedgerProvider({
          dAppIdentifier: "react-ledger",
          floatingButtonPosition: "bottom-right",
          // devConfig: { stub: { device: true, account: true } }  // ← uncomment to test without hardware
        });

        // ── EIP-6963 provider discovery ───────────────────────────────────────
        const handleAnnounce = (event: Event) => {
          const detail = (event as CustomEvent).detail as {
            provider: EIP1193Provider;
            info: { rdns: string; name: string };
          };
          // Filter: only accept the Ledger Button (rdns = "com.ledger").
          // Other injected wallets (MetaMask, etc.) are ignored.
          if (detail.info.rdns !== "com.ledger") return;

          const provider = detail.provider;

          // Seed the accounts cache for already-connected wallets on page load.
          (provider.request({ method: "eth_accounts" }) as Promise<string[]>)
            .then((accounts) => {
              liveAccountsRef.current = accounts;
              refSeededRef.current = true;
            })
            .catch(() => {
              refSeededRef.current = true;
            });

          // Watch for account changes.
          const handleAccountsChanged = (accounts: unknown) => {
            const newAccounts = accounts as string[];
            const prevAddress = liveAccountsRef.current[0];
            liveAccountsRef.current = newAccounts;
            if (!refSeededRef.current) return;
            if (newAccounts[0] !== prevAddress) {
              setWalletKey((k) => k + 1);
            }
          };
          provider.on("accountsChanged", handleAccountsChanged);

          // Publish to the module singleton so page.tsx can access the provider
          // without going through React context.
          notifyProviderDiscovered(provider);

          // Trigger ZamaProvider mount.
          setLedgerProvider(provider);
        };

        window.addEventListener("eip6963:announceProvider", handleAnnounce);
        // Ask all registered providers (including our newly mounted Ledger Button)
        // to re-announce themselves.
        window.dispatchEvent(new Event("eip6963:requestProvider"));

        return () => {
          window.removeEventListener("eip6963:announceProvider", handleAnnounce);
          cleanup?.();
        };
      })
      .catch((err) => console.error("[Providers] Failed to load Ledger Button:", err));
  }, []);

  // hoodiCleartextConfig + HOODI_RPC_URL are build-time constants — relayer never changes.
  const relayer = useMemo(
    () => new RelayerCleartext({ ...hoodiCleartextConfig, network: HOODI_RPC_URL }),
    [],
  );

  // Recreated when the Ledger provider first arrives and on each wallet switch.
  const signer = useMemo(() => {
    if (!ledgerProvider) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hybrid = createHybridProvider(ledgerProvider, liveAccountsRef) as any;
    return new EthersSigner({ ethereum: hybrid });
  }, [ledgerProvider, walletKey]);

  // ZamaProvider waits until the Ledger Button provider has been discovered.
  // During that window (typically < 1 s), children render without SDK context.
  // page.tsx shows its own loading screen while address === null.
  if (!signer) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        key={walletKey}
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
