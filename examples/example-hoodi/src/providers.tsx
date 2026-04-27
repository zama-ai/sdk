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
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { hoodi } from "@zama-fhe/sdk/chains";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { JsonRpcProvider } from "ethers";
import { HOODI_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// This file wires together the three SDK primitives every integration needs:
//
//   const signer  = new EthersSigner({ ethereum });
//   const relayer = new RelayerCleartext({ chainId: hoodi.id, network: HOODI_RPC_URL, ... });
//   <ZamaProvider relayer={relayer} signer={signer}
//     storage={indexedDBStorage} sessionStorage={sessionDBStorage}>
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
    // No wallet injected — return a no-op provider so ZamaProvider mounts without
    // crashing. page.tsx checks getEthereumProvider() before calling connect(), so all
    // user-visible wallet operations still fail gracefully.
    return {
      request() {
        return Promise.reject(new Error("No wallet injected"));
      },
      on() {},
      removeListener() {},
    };
  }

  const rpcProvider = new JsonRpcProvider(HOODI_RPC_URL);

  // Tracks the highest block number ever returned to ethers. eth_blockNumber responses
  // are adjusted so the value is always strictly increasing — even when the wallet node
  // returns the same block across consecutive polls. ethers' PollingBlockSubscriber only
  // triggers an eth_getTransactionReceipt check when it sees a new block, so without this
  // adjustment receipts are only checked once per block (~12 s on Hoodi) instead of once
  // per poll interval (4 s). The adjustment is purely for ethers' internal polling — it
  // has no effect on any other RPC call and resets when the provider is recreated on
  // wallet switch.
  let highWaterBlock = 0n;

  return {
    request({ method, params }: { method: string; params?: unknown[] }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        if (liveAccountsRef.current.length > 0) {
          // Cache hit — serve immediately so EthersSigner resolves without a wallet roundtrip.
          return Promise.resolve([...liveAccountsRef.current]);
        }
        // Cache empty (initial mount, not yet seeded): query eth_accounts (non-requesting).
        // This avoids triggering an unexpected wallet popup from EthersSigner's eager
        // getSigner() call. Returns the connected accounts on page refresh (no popup),
        // or [] when not yet connected (getSigner fails gracefully, balances stay "—").
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (ethereum as any).request({ method: "eth_accounts", params: [] });
      }
      const dest = WALLET_METHODS.has(method) || method.startsWith("wallet_") ? "wallet" : "rpc";
      if (dest === "wallet") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (ethereum as any).request({ method, params }) as Promise<unknown>;
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
  // Created once per Providers mount — avoids sharing the QueryClient across
  // SSR requests and React Strict Mode double-invocations.
  const [queryClient] = useState(() => new QueryClient());

  // Updated synchronously in accountsChanged (before setWalletKey re-renders) so the
  // next EthersSigner sees the correct accounts immediately via the hybrid provider.
  const liveAccountsRef = useRef<readonly string[]>([]);

  // Becomes true once the initial eth_accounts call resolves. accountsChanged events
  // that arrive before that point are ignored — some wallets (Phantom, certain MetaMask
  // versions) fire accountsChanged on page load before the async seed completes, which
  // would cause a spurious ZamaProvider remount and force the user to re-sign.
  const refSeededRef = useRef(false);

  // Incremented on wallet switch to remount ZamaProvider with a fresh EthersSigner
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
    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => ethereum.removeListener("accountsChanged", handleAccountsChanged);
  }, []);

  // hoodi chain config and HOODI_RPC_URL are build-time constants — relayer never changes.
  const relayer = useMemo(
    () =>
      new RelayerCleartext({
        chainId: hoodi.id,
        network: HOODI_RPC_URL,
        gatewayChainId: hoodi.gatewayChainId,
        aclContractAddress: hoodi.aclContractAddress as `0x${string}`,
        executorAddress: hoodi.executorAddress!,
        verifyingContractAddressDecryption:
          hoodi.verifyingContractAddressDecryption as `0x${string}`,
        verifyingContractAddressInputVerification:
          hoodi.verifyingContractAddressInputVerification as `0x${string}`,
        registryAddress: hoodi.registryAddress,
      }),
    [],
  );

  // Recreated on wallet switch so the new EthersSigner is bound to the new account address.
  const signer = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hybridEthereum = createHybridEthereum(getEthereumProvider(), liveAccountsRef) as any;
    return new EthersSigner({ ethereum: hybridEthereum });
  }, [walletKey]);

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
          // survives a tab close between Phase 1 and Phase 2.
          // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
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
