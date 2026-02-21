"use client";

import type { GenericStringStorage, RelayerSDK } from "@zama-fhe/token-sdk";
import type { BrowserProvider } from "ethers";
import { type PropsWithChildren, useMemo } from "react";
import { TokenSDKProvider } from "../provider";
import { EthersSigner } from "./ethers-signer";

interface EthersTokenSDKProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  storage: GenericStringStorage;
  provider: BrowserProvider;
}

/**
 * Ethers-aware TokenSDK provider.
 * Wraps the provider in an EthersSigner (signer is resolved lazily on first use).
 */
export function EthersTokenSDKProvider({
  children,
  relayer,
  storage,
  provider,
}: EthersTokenSDKProviderProps) {
  const signer = useMemo(() => new EthersSigner(provider), [provider]);

  return (
    <TokenSDKProvider relayer={relayer} storage={storage} signer={signer}>
      {children}
    </TokenSDKProvider>
  );
}
