"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider, indexedDBStorage } from "@zama-fhe/react-sdk";
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { JsonRpcProvider } from "ethers";
import { useMemo, type ReactNode } from "react";

const HOODI_RPC_URL = process.env.NEXT_PUBLIC_HOODI_RPC_URL ?? "https://rpc.hoodi.ethpandaops.io";

const queryClient = new QueryClient();

/**
 * Route eth_call through a direct JsonRpcProvider pointed at the Hoodi RPC,
 * bypassing MetaMask's network routing for read-only calls. All other EIP-1193
 * methods (eth_sendTransaction, eth_sign, wallet_*, …) are forwarded to MetaMask
 * so the user still sees confirmation popups for write operations.
 */
function createHybridEthereum(ethereum: typeof window.ethereum) {
  if (!ethereum) {
    // No wallet injected — return a no-op provider so ZamaProvider mounts without
    // crashing. page.tsx checks window.ethereum before calling connect(), so all
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
      if (method === "eth_call") return rpcProvider.send(method, params ?? []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (ethereum as any).request({ method, params });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on: (...args: any[]) => (ethereum as any).on(...args),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeListener: (...args: any[]) => (ethereum as any).removeListener(...args),
  };
}

export function Providers({ children }: { children: ReactNode }) {
  const { signer, relayer } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hybridEthereum = createHybridEthereum(window.ethereum) as any;
    const signer = new EthersSigner({ ethereum: hybridEthereum });
    const relayer = new RelayerCleartext(
      HOODI_RPC_URL !== "https://rpc.hoodi.ethpandaops.io"
        ? { ...hoodiCleartextConfig, network: HOODI_RPC_URL }
        : hoodiCleartextConfig,
    );
    return { signer, relayer };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider relayer={relayer} storage={indexedDBStorage} signer={signer}>
        {children}
      </ZamaProvider>
    </QueryClientProvider>
  );
}
