"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
} from "@zama-fhe/react-sdk";
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { JsonRpcProvider } from "ethers";
import { HOODI_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

const queryClient = new QueryClient();

// Wallet-specific methods must go through the injected wallet (account state, signing, chain management).
// Everything else (eth_call, eth_getTransactionReceipt, …) is routed to the direct Hoodi RPC
// so that receipt polling is fast and reliable — the wallet's own RPC can lag by 60 s+ on Hoodi.
const WALLET_METHODS = new Set([
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
  "net_version",
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "personal_sign",
]);

/**
 * Hybrid EIP-1193 provider: wallet calls → injected wallet, read calls → direct Hoodi RPC.
 *
 * liveAccountsRef: caches the connected accounts so eth_requestAccounts / eth_accounts
 * resolve immediately from the ref. Without this, EthersSigner's internal getSigner()
 * call can hang in the wallet's queue during rapid wallet switches ("Decrypting…" forever).
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
  return {
    request({ method, params }: { method: string; params?: unknown[] }) {
      // Serve account queries from the cache so EthersSigner resolves immediately.
      if (
        (method === "eth_requestAccounts" || method === "eth_accounts") &&
        liveAccountsRef.current.length > 0
      ) {
        return Promise.resolve([...liveAccountsRef.current]);
      }
      if (WALLET_METHODS.has(method) || method.startsWith("wallet_")) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (ethereum as any).request({ method, params });
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
  // Updated synchronously in accountsChanged (before setWalletKey re-renders) so the
  // next EthersSigner sees the correct accounts immediately via the hybrid provider.
  const liveAccountsRef = useRef<readonly string[]>([]);

  // Incremented on wallet switch to remount ZamaProvider with a fresh EthersSigner
  // bound to the new account. See createHybridEthereum for why this is necessary.
  const [walletKey, setWalletKey] = useState(0);

  useEffect(() => {
    const ethereum = getEthereumProvider();
    if (!ethereum) return;
    // Seed the ref for already-connected wallets on page load.
    (ethereum.request({ method: "eth_accounts" }) as Promise<string[]>).then(
      (accounts) => {
        liveAccountsRef.current = accounts;
      },
      () => {},
    );
    const handleAccountsChanged = (accounts: unknown) => {
      const newAccounts = accounts as string[];
      // Only remount ZamaProvider when the active account actually changes.
      // Some wallets (e.g. Phantom) fire accountsChanged with the same account
      // on page load or after transactions, which would cause unnecessary remounts
      // and trigger repeated EIP-712 session prompts.
      const prevAddress = liveAccountsRef.current[0];
      liveAccountsRef.current = newAccounts;
      if (newAccounts[0] !== prevAddress) {
        setWalletKey((k) => k + 1);
      }
    };
    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => ethereum.removeListener("accountsChanged", handleAccountsChanged);
  }, []);

  const { signer, relayer } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hybridEthereum = createHybridEthereum(getEthereumProvider(), liveAccountsRef) as any;
    const signer = new EthersSigner({ ethereum: hybridEthereum });
    const relayer = new RelayerCleartext({ ...hoodiCleartextConfig, network: HOODI_RPC_URL });
    return { signer, relayer };
  }, [walletKey]); // Recreated on wallet switch so the new account's address is used.

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider
        key={walletKey}
        relayer={relayer}
        storage={indexedDBStorage}
        sessionStorage={indexedDBStorage}
        signer={signer}
        onEvent={(event) => {
          // ZamaSDKEvents.UnwrapSubmitted fires right after the Phase 1 tx is submitted
          // (before it is mined). Saving here ensures the pending state survives a tab close.
          // See activeUnshield.ts for why wrapperAddress is passed via a module-level ref.
          if (event.type === ZamaSDKEvents.UnwrapSubmitted) {
            const wrapperAddress = getActiveUnshieldToken();
            if (wrapperAddress) {
              savePendingUnshield(indexedDBStorage, wrapperAddress, event.txHash);
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
