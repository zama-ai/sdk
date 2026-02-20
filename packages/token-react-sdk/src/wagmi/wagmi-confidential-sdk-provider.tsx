"use client";

import type { GenericStringStorage, RelayerSDK } from "@zama-fhe/token-sdk";
import { type PropsWithChildren, useMemo } from "react";
import { useConfig } from "wagmi";
import { ConfidentialSDKProvider } from "../provider";
import { WagmiSigner } from "./wagmi-signer";

interface WagmiConfidentialSDKProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  storage: GenericStringStorage;
}

/**
 * Wagmi-aware ConfidentialSDK provider.
 * Automatically creates a signer from the connected wallet.
 * Must be placed inside a WagmiProvider.
 *
 * When no wallet is connected (and no address override), children render
 * without the SDK context.
 */
export function WagmiConfidentialSDKProvider({
  children,
  relayer,
  storage,
}: WagmiConfidentialSDKProviderProps) {
  const wagmiConfig = useConfig();

  const signer = useMemo(() => new WagmiSigner(wagmiConfig), [wagmiConfig]);

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
