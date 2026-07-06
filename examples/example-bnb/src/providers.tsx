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
import { BSC_TESTNET_RPC_URL } from "@/lib/config";
import { getActiveUnshieldToken, setActiveUnshieldToken } from "@/lib/activeUnshield";
import { getEthereumProvider } from "@/lib/ethereum";

// ── What this file does ────────────────────────────────────────────────────────
//
// Wires the three SDK primitives every integration needs:
//
//   const config = createConfig({ chains, ethereum, provider, relayers, storage, permitStorage });
//   <ZamaProvider config={config}>
//
// The BNB chain config is inlined below (no shipped preset yet for chain 97).
// The cleartext relayer transport (`cleartext()`) is used because this BNB Smart Chain Testnet
// deployment runs the cleartext FHEVM host stack — there is no real relayer/KMS network.
//
// SDK reads use a JsonRpcProvider pointed at BSC_TESTNET_RPC_URL. Wallet writes and EIP-712
// signing use the injected EIP-1193 provider through the ethers adapter.
//
// Two extra layers handle wallet reactivity:
//
// 1. Separate IndexedDB instances for storage and permitStorage — not required for
//    correctness (keys are namespaced internally), kept separate here for clarity
//    between the two storage responsibilities.
//
// 2. walletKey + refSeededRef — remounts ZamaProvider on wallet switch with fresh
//    ethers adapter state bound to the new account, while ignoring spurious
//    accountsChanged events some wallets emit before eth_accounts resolves.
// ──────────────────────────────────────────────────────────────────────────────

// Separate DB from indexedDBStorage — see block comment above for the reason.
const permitDBStorage = new IndexedDBStorage("PermitStore");

// Cleartext FHEVM host stack for BNB Smart Chain Testnet (chain 97, Chapel), deployed for this demo.
// Development/integration setup — values are kept in cleartext on-chain rather than encrypted — and
// isn't intended for production use.
const zamaBscTestnetCleartext = {
  id: 97,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: BSC_TESTNET_RPC_URL,
  aclContractAddress: "0x52470e945521E247Cb4754088a836Dc4b838AFBE",
  kmsContractAddress: "0x788F5BB2d93aB4Cb67Fe2277757aE95006504F6F",
  inputVerifierContractAddress: "0x49e0BAB39904E4192c30CFB58573Cbe27B7E398E",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  registryAddress: "0xc0E8B73b1C58D846e1d4f8fAE2E1466C85BCeAeC",
  executorAddress: "0x5985e48689550c1b2893ABfBbe4cc0eE3A22cc54",
} as const;

export function Providers({ children }: { children: ReactNode }) {
  // Created once per Providers mount — avoids sharing the QueryClient across
  // SSR requests and React Strict Mode double-invocations.
  const [queryClient] = useState(() => new QueryClient());

  // Updated synchronously in accountsChanged (before setWalletKey re-renders) so the
  // next ethers adapter config sees the correct accounts immediately.
  const liveAccountsRef = useRef<readonly string[]>([]);

  // Becomes true once the initial eth_accounts call resolves. accountsChanged events
  // that arrive before that point are ignored — some wallets fire accountsChanged
  // on page load before the async seed completes, which
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
        if (method === "eth_chainId") return `0x${zamaBscTestnetCleartext.id.toString(16)}`;
        throw new Error("No Ethereum wallet detected. Connect a wallet to use this app.");
      },
      on: () => {},
      removeListener: () => {},
    }) as EIP1193Provider;
    const provider = new JsonRpcProvider(BSC_TESTNET_RPC_URL);

    return createConfig({
      chains: [zamaBscTestnetCleartext],
      ethereum,
      provider,
      storage: indexedDBStorage,
      permitStorage: permitDBStorage,
      relayers: { [zamaBscTestnetCleartext.id]: cleartext() },
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
