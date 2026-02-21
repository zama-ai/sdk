"use client";

import type { GenericStringStorage, RelayerSDK } from "@zama-fhe/token-sdk";
import { type PropsWithChildren, useMemo } from "react";
import { useConfig } from "wagmi";
import { TokenSDKProvider } from "../provider";
import { WagmiSigner } from "./wagmi-signer";

interface WagmiTokenSDKProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  storage: GenericStringStorage;
}

/**
 * Wagmi-aware TokenSDK provider.
 * Automatically creates a signer from the connected wallet.
 * Must be placed inside a WagmiProvider.
 *
 * When no wallet is connected (and no address override), children render
 * without the SDK context.
 */
export function WagmiTokenSDKProvider({ children, relayer, storage }: WagmiTokenSDKProviderProps) {
  const wagmiConfig = useConfig();

  const signer = useMemo(() => new WagmiSigner(wagmiConfig), [wagmiConfig]);

  return (
    <TokenSDKProvider relayer={relayer} storage={storage} signer={signer}>
      {children}
    </TokenSDKProvider>
  );
}
