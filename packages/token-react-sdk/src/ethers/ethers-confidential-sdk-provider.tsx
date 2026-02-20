"use client";

import type { GenericStringStorage, RelayerSDK } from "@zama-fhe/token-sdk";
import type { Signer } from "ethers";
import { type PropsWithChildren, useMemo } from "react";
import { ConfidentialSDKProvider } from "../provider";
import { EthersSigner } from "./ethers-signer";

interface EthersConfidentialSDKProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  storage: GenericStringStorage;
  signer: Signer;
}

/**
 * Ethers-aware ConfidentialSDK provider.
 * Resolves the async ethers signer and provides the SDK to the tree.
 *
 * While the signer is being resolved, children render without the SDK context.
 */
export function EthersConfidentialSDKProvider({
  children,
  relayer,
  storage,
  signer: ethersSigner,
}: EthersConfidentialSDKProviderProps) {
  const signer = useMemo(() => new EthersSigner(ethersSigner), [ethersSigner]);

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
