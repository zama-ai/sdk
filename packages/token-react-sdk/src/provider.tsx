"use client";

import type { ConfidentialSigner, GenericStringStorage, RelayerSDK } from "@zama-fhe/token-sdk";
import { TokenSDK } from "@zama-fhe/token-sdk";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo } from "react";

interface TokenSDKProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  signer: ConfidentialSigner;
  storage: GenericStringStorage;
}

const TokenSDKContext = createContext<TokenSDK | null>(null);

export function TokenSDKProvider({ children, relayer, signer, storage }: TokenSDKProviderProps) {
  const sdk = useMemo(
    () =>
      new TokenSDK({
        relayer,
        signer,
        storage,
      }),
    [relayer, signer, storage],
  );

  useEffect(() => {
    return () => sdk.terminate();
  }, [sdk]);

  return <TokenSDKContext.Provider value={sdk}>{children}</TokenSDKContext.Provider>;
}

export function useTokenSDK(): TokenSDK {
  const context = useContext(TokenSDKContext);

  if (!context) {
    throw new Error("useTokenSDK must be used within a TokenSDKProvider");
  }

  return context;
}
