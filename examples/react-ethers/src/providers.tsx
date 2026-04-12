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
import { SEPOLIA_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// Uses createZamaConfig with the ethers adapter path:
//
//   const zamaConfig = createZamaConfig({
//     ethers: { ethereum },
//     transports: { ... },
//   });
//   <ZamaProvider config={zamaConfig}>
//
// walletKey + refSeededRef pattern remounts on wallet switch.
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
    const provider = ethereum ?? {
      request: async () => {
        throw new Error("No Ethereum wallet detected. Connect a wallet to use this app.");
      },
      on: () => {},
      removeListener: () => {},
    };

    return createZamaConfig({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ethers: { ethereum: provider as any },
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
  }, [walletKey]);

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider key={walletKey} config={zamaConfig}>
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
