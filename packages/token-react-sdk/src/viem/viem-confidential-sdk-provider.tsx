"use client";

import type { GenericStringStorage, RelayerWeb } from "@zama-fhe/token-sdk";
import { type PropsWithChildren, useMemo } from "react";
import type { PublicClient, WalletClient } from "viem";
import { ConfidentialSDKProvider } from "../provider";
import { ViemSigner } from "./viem-signer";

interface ViemConfidentialSDKProviderProps extends PropsWithChildren {
  relayer: RelayerWeb;
  storage: GenericStringStorage;
  walletClient: WalletClient;
  publicClient: PublicClient;
}

/**
 * Viem-aware ConfidentialSDK provider.
 * Automatically creates a signer from the provided viem clients.
 */
export function ViemConfidentialSDKProvider({
  children,
  relayer,
  storage,
  walletClient,
  publicClient,
}: ViemConfidentialSDKProviderProps) {
  const signer = useMemo(
    () => new ViemSigner(walletClient, publicClient),
    [walletClient, publicClient],
  );

  return (
    <ConfidentialSDKProvider
      relayer={relayer}
      storage={storage}
      signer={signer}
    >
      {children}
    </ConfidentialSDKProvider>
  );
}
