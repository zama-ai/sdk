"use client";

import type { GenericStringStorage, RelayerWeb } from "@zama-fhe/token-sdk";
import { type PropsWithChildren, useMemo } from "react";
import type { PublicClient, WalletClient } from "viem";
import { TokenSDKProvider } from "../provider";
import { ViemSigner } from "./viem-signer";

interface ViemTokenSDKProviderProps extends PropsWithChildren {
  relayer: RelayerWeb;
  storage: GenericStringStorage;
  walletClient: WalletClient;
  publicClient: PublicClient;
}

/**
 * Viem-aware TokenSDK provider.
 * Automatically creates a signer from the provided viem clients.
 */
export function ViemTokenSDKProvider({
  children,
  relayer,
  storage,
  walletClient,
  publicClient,
}: ViemTokenSDKProviderProps) {
  const signer = useMemo(
    () => new ViemSigner(walletClient, publicClient),
    [walletClient, publicClient],
  );

  return (
    <TokenSDKProvider relayer={relayer} storage={storage} signer={signer}>
      {children}
    </TokenSDKProvider>
  );
}
