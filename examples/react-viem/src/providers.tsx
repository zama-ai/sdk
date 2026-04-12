"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  ZamaSDKEvents,
  indexedDBStorage,
  savePendingUnshield,
  createZamaConfig,
  relayer,
} from "@zama-fhe/react-sdk";
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
// Uses createZamaConfig with the viem adapter path:
//
//   const zamaConfig = createZamaConfig({
//     viem: { publicClient, walletClient },
//     transports: { ... },
//   });
//   <ZamaProvider config={zamaConfig}>
//
// walletKey + refSeededRef pattern remounts on wallet switch — same as before,
// but now the config object is recreated via createZamaConfig.
// ──────────────────────────────────────────────────────────────────────────────

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
      if (!refSeededRef.current) return;
      if (newAccounts[0] !== prevAddress) {
        setWalletKey((k) => k + 1);
      }
    };
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

  const zamaConfig = useMemo(() => {
    const ethereum = getEthereumProvider();
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL),
    });

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
      viem: { publicClient, walletClient, ethereum: ethereum ?? undefined },
      transports: {
        [SepoliaConfig.chainId]: relayer(`${window.location.origin}/api/relayer`, {
          network: SEPOLIA_RPC_URL,
        }),
      },
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
