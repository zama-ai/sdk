"use client";

import type {
  ConfidentialSigner,
  GenericStringStorage,
  RelayerSDK,
} from "@zama-fhe/token-sdk";
import { ConfidentialSDK } from "@zama-fhe/token-sdk";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
} from "react";

interface ConfidentialSDKProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  signer: ConfidentialSigner;
  storage: GenericStringStorage;
}

const ConfidentialContext = createContext<ConfidentialSDK | null>(null);

export function ConfidentialSDKProvider({
  children,
  relayer,
  signer,
  storage,
}: ConfidentialSDKProviderProps) {
  const sdk = useMemo(
    () =>
      new ConfidentialSDK({
        relayer,
        signer,
        storage,
      }),
    [relayer, signer, storage],
  );

  useEffect(() => {
    return () => sdk.terminate();
  }, [sdk]);

  return (
    <ConfidentialContext.Provider value={sdk}>
      {children}
    </ConfidentialContext.Provider>
  );
}

export function useConfidentialSDK(): ConfidentialSDK {
  const context = useContext(ConfidentialContext);

  if (!context) {
    throw new Error(
      "useConfidentialSDK must be used within a ConfidentialSDKProvider",
    );
  }

  return context;
}
