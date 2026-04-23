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
import { cleartext } from "@zama-fhe/sdk";
import { hoodi } from "@zama-fhe/sdk/chains";
import { hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { createConfig } from "@zama-fhe/sdk/ethers";
import { JsonRpcProvider } from "ethers";
import { HOODI_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// This file wires together the SDK via createConfig:
//
//   const config  = createConfig({ chains: [hoodi], ethereum, transports: { ... } });
//   <ZamaProvider config={config}>
//
// That is the minimal setup. This file adds three extra layers to handle issues
// specific to MetaMask + Hoodi — you may not need all of them in your integration:
//
// 1. Hybrid EIP-1193 provider (createHybridEthereum) — routes eth_call /
//    eth_estimateGas to a direct JsonRpcProvider for speed, and routes signing,
//    nonce (eth_getTransactionCount), and receipt polling to the injected wallet
//    to avoid stale data from the Hoodi load balancer. See WALLET_METHODS below.
//
// 2. Separate IndexedDB instances for storage and sessionStorage — both use the
//    same internal key; sharing one DB instance causes the session entry to
//    overwrite the encrypted keypair, forcing re-signing on every balance decrypt.
//
// 3. walletKey + refSeededRef — remounts ZamaProvider on wallet switch with a
//    fresh EthersSigner bound to the new account, while ignoring spurious
//    accountsChanged events some wallets emit before eth_accounts resolves.
//
// See WALKTHROUGH.md §"Architecture at a glance" for the full rationale.
// ──────────────────────────────────────────────────────────────────────────────

// Separate IndexedDB database for session signatures (EIP-712 wallet signatures that
// authorize decryption). Must be distinct from indexedDBStorage ("CredentialStore") because
// both use the same storage key — storing them in the same DB would cause the session entry
// to overwrite the encrypted keypair, corrupting credentials on the next decrypt attempt.
const sessionDBStorage = new IndexedDBStorage("SessionStore");

/**
 * Methods routed to the injected wallet rather than the direct Hoodi RPC.
 *
 * Four categories:
 *
 * 1. Chain management — must go through the wallet. Note: eth_requestAccounts /
 *    eth_accounts are NOT in this set; they are intercepted before routing and always
 *    served from the liveAccountsRef cache (see createHybridEthereum JSDoc).
 *
 * 2. Signing and transaction submission — the wallet holds the private key.
 *
 * 3. Nonce tracking — eth_getTransactionCount must go through the wallet's node.
 *    The Hoodi load balancer can serve a stale nonce (e.g. 136 when the real next
 *    nonce is 182), causing ethers to build a transaction with a too-low nonce that
 *    MetaMask then rejects. MetaMask is the source of truth for the account's nonce.
 *
 * 4. Post-submission polling (eth_getTransactionByHash, eth_blockNumber,
 *    eth_getTransactionReceipt) — rpc.hoodi.ethpandaops.io is a load balancer
 *    whose backend nodes are at different heights. Routing through it causes
 *    eth_blockNumber to return decreasing values (preventing ethers'
 *    PollingBlockSubscriber from detecting new blocks) and
 *    eth_getTransactionReceipt to return null indefinitely (stale node hasn't
 *    indexed the block yet). MetaMask's node, which received the transaction
 *    directly via eth_sendTransaction, is the consistent source of truth here.
 *
 * Everything else (eth_call, eth_estimateGas, eth_getLogs) goes to the direct
 * Hoodi RPC for fast, wallet-independent reads.
 */
const WALLET_METHODS = new Set([
  // 1. Chain management (account queries are intercepted before routing — see JSDoc above)
  "eth_chainId",
  "net_version",
  // 2. Signing / submission
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "personal_sign",
  // 3. Nonce — must match the wallet's internal nonce tracker to avoid "nonce too low"
  "eth_getTransactionCount",
  // 4. Post-submission polling
  "eth_getTransactionByHash",
  "eth_blockNumber",
  "eth_getTransactionReceipt",
]);

/**
 * Hybrid EIP-1193 provider:
 * - Wallet methods (signing, tx submission, tx lookup, block polling) → injected wallet
 * - Everything else (eth_call, eth_estimateGas, eth_getLogs) → direct Hoodi RPC
 *
 * liveAccountsRef: account queries (eth_requestAccounts / eth_accounts) are intercepted
 * before the WALLET_METHODS routing. When the cache is populated, they are served
 * immediately from the ref (avoids a wallet roundtrip and races). When the cache is empty
 * (initial mount, not yet seeded), the query is forwarded to the wallet as eth_accounts
 * (the non-permission-requesting variant) so that:
 * - Page refresh (wallet connected): returns the connected account immediately — getSigner() works.
 * - Fresh install (wallet not connected): returns [] silently — getSigner() fails gracefully,
 *   no unexpected popup. After the user explicitly connects via Connect Wallet, walletKey
 *   increments → ZamaProvider remounts → new EthersSigner created with the populated cache.
 */
function createHybridEthereum(
  ethereum: typeof window.ethereum,
  liveAccountsRef: { readonly current: readonly string[] },
) {
  if (!ethereum) {
    return {
      request() {
        return Promise.reject(new Error("No wallet injected"));
      },
      on() {},
      removeListener() {},
    };
  }

  const rpcProvider = new JsonRpcProvider(HOODI_RPC_URL);
  let highWaterBlock = 0n;

  return {
    request({ method, params }: { method: string; params?: unknown[] }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        if (liveAccountsRef.current.length > 0) {
          return Promise.resolve([...liveAccountsRef.current]);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (ethereum as any).request({
          method: "eth_accounts",
          params: [],
        });
      }
      const dest = WALLET_METHODS.has(method) || method.startsWith("wallet_") ? "wallet" : "rpc";
      if (dest === "wallet") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (ethereum as any).request({
          method,
          params,
        }) as Promise<unknown>;
        if (method === "eth_blockNumber") {
          return p.then((block: unknown) => {
            const actual = BigInt(block as string);
            if (actual > highWaterBlock) highWaterBlock = actual;
            else highWaterBlock += 1n;
            return `0x${highWaterBlock.toString(16)}`;
          });
        }
        return p;
      }
      return rpcProvider.send(method, params ?? []);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on: (...args: any[]) => (ethereum as any).on(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeListener: (...args: any[]) => (ethereum as any).removeListener(...args),
  };
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const liveAccountsRef = useRef<readonly string[]>([]);
  const refSeededRef = useRef(false);
  const [walletKey, setWalletKey] = useState(0);

  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
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
      if (!refSeededRef.current) return;
      if (newAccounts[0] !== prevAddress) {
        setWalletKey((k) => k + 1);
      }
    };
    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => ethereum.removeListener("accountsChanged", handleAccountsChanged);
  }, []);

  // Recreated on wallet switch so the new EthersSigner is bound to the new account address.
  const zamaConfig = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hybridEthereum = createHybridEthereum(getEthereumProvider(), liveAccountsRef);
    return createConfig({
      chains: [hoodi],
      ethereum: hybridEthereum,
      transports: {
        [hoodi.id]: cleartext({
          ...hoodiCleartextConfig,
          network: HOODI_RPC_URL,
        }),
      },
      storage: indexedDBStorage,
      sessionStorage: sessionDBStorage,
      onEvent: (event: ZamaSDKEvents) => {
        if (event.type === ZamaSDKEvents.UnshieldPhase1Submitted) {
          const wrapperAddress = getActiveUnshieldToken();
          if (wrapperAddress) {
            savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash).catch(
              (err: unknown) =>
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
