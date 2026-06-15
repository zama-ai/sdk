"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaSDKEvents,
  IndexedDBStorage,
  indexedDBStorage,
  savePendingUnshield,
  cleartext,
} from "@zama-fhe/sdk";
import { createConfig } from "@zama-fhe/sdk/ethers";
import type { EIP1193Provider } from "@zama-fhe/sdk/ethers";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { JsonRpcProvider } from "ethers";
import { INGEN_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// Wires the three SDK primitives every integration needs:
//
//   const config = createConfig({ chains, ethereum, provider, relayers, storage, permitStorage });
//   <ZamaProvider config={config}>
//
// The InGen chain config is inlined below (no shipped preset yet for chain 364301).
// The cleartext relayer transport (`cleartext()`) is used because InGen runs the
// cleartext FHEVM host stack — there is no real relayer/KMS network to call.
//
// SDK reads use a JsonRpcProvider pointed at INGEN_RPC_URL. Wallet writes and EIP-712
// signing use the injected EIP-1193 provider through the ethers adapter.
//
// Two extra layers handle wallet reactivity:
//
// 1. Separate IndexedDB instances for storage and permitStorage — distinct SDK
//    persistence responsibilities, must not overwrite each other.
//
// 2. walletKey + refSeededRef — remounts ZamaProvider on wallet switch with fresh
//    ethers adapter state bound to the new account, while ignoring spurious
//    accountsChanged events some wallets emit before eth_accounts resolves.
// ──────────────────────────────────────────────────────────────────────────────

// Separate DB from indexedDBStorage — see block comment above for the reason.
const permitDBStorage = new IndexedDBStorage("PermitStore");

// Cleartext FHEVM host stack for the T-Rex InGen testnet (chain 364301), deployed for this demo.
// Development/integration setup — values are kept in cleartext on-chain rather than encrypted — and
// isn't intended for production use.
const zamaIngenCleartext = {
  id: 364301,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: INGEN_RPC_URL,
  aclContractAddress: "0x09a4710BfBe7B557cD5CFE88BB31e9b5b85C419b",
  kmsContractAddress: "0xd885DEa6a924785fCcdf9CE993FEe27EA11832e6",
  inputVerifierContractAddress: "0x90f05B10db153365D8cB143EA17f5E5714D0bCD5",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  registryAddress: "0x7FC3D79EF9d01fA318CF2Aa5D91dDC492383Be0F",
  executorAddress: "0x1B05DE5b67b8f8363DC04E3a5996a616f11f8C7B",
} as const;

export function Providers({ children }: { children: ReactNode }) {
  // Created once per Providers mount — avoids sharing the QueryClient across
  // SSR requests and React Strict Mode double-invocations.
  const [queryClient] = useState(() => new QueryClient());

  // Updated synchronously in accountsChanged (before setWalletKey re-renders) so the
  // next ethers adapter config sees the correct accounts immediately.
  const liveAccountsRef = useRef<readonly string[]>([]);

  // Becomes true once the initial eth_accounts call resolves. accountsChanged events
  // that arrive before that point are ignored — some wallets (Phantom, certain MetaMask
  // versions) fire accountsChanged on page load before the async seed completes, which
  // would cause a spurious ZamaProvider remount and force the user to re-sign.
  const refSeededRef = useRef(false);

  // Incremented on wallet switch to remount ZamaProvider with fresh ethers adapter state
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
    const ethereum = (getEthereumProvider() ?? {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_accounts") return [];
        if (method === "eth_chainId") return `0x${zamaIngenCleartext.id.toString(16)}`;
        throw new Error("No Ethereum wallet detected. Connect a wallet to use this app.");
      },
      on: () => {},
      removeListener: () => {},
    }) as EIP1193Provider;
    const provider = new JsonRpcProvider(INGEN_RPC_URL);

    return createConfig({
      chains: [zamaIngenCleartext],
      ethereum,
      provider,
      storage: indexedDBStorage,
      permitStorage: permitDBStorage,
      relayers: { [zamaIngenCleartext.id]: cleartext() },
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
