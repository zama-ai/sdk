"use client";

import type { GenericStringStorage, RelayerSDK } from "@zama-fhe/token-sdk";
import type { Signer } from "ethers";
import { type PropsWithChildren, useMemo } from "react";
import { TokenSDKProvider } from "../provider";
import { EthersSigner } from "./ethers-signer";

interface EthersTokenSDKProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  storage: GenericStringStorage;
  signer: Signer;
}

/**
 * Ethers-aware TokenSDK provider.
 * Resolves the async ethers signer and provides the SDK to the tree.
 *
 * While the signer is being resolved, children render without the SDK context.
 */
export function EthersTokenSDKProvider({
  children,
  relayer,
  storage,
  signer: ethersSigner,
}: EthersTokenSDKProviderProps) {
  const signer = useMemo(() => new EthersSigner(ethersSigner), [ethersSigner]);

  return (
    <TokenSDKProvider relayer={relayer} storage={storage} signer={signer}>
      {children}
    </TokenSDKProvider>
  );
}
