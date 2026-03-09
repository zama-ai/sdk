"use client";

import { invalidateWalletLifecycleQueries } from "@zama-fhe/sdk/query";
import { ZamaSDK } from "@zama-fhe/sdk";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  isWagmiAdapter,
  WAGMI_PROVIDER_REQUIRED_ERROR,
  type FhevmConfig,
  type WagmiAdapter,
} from "./config";
import { resolveRelayer } from "./resolve-relayer";
import { resolveWallet } from "./resolve-wallet";

export interface FhevmProviderProps extends PropsWithChildren {
  config: FhevmConfig;
  queryClient?: QueryClient;
}

const FhevmClientContext = createContext<ZamaSDK | null>(null);

export function FhevmProvider({ config, queryClient, children }: FhevmProviderProps) {
  if (isWagmiAdapter(config.wallet)) {
    return (
      <WagmiFhevmProviderInner config={config} queryClient={queryClient}>
        {children}
      </WagmiFhevmProviderInner>
    );
  }

  return (
    <FhevmProviderInner config={config} queryClient={queryClient} wagmiConfig={null}>
      {children}
    </FhevmProviderInner>
  );
}

function WagmiFhevmProviderInner({ config, queryClient, children }: FhevmProviderProps) {
  // config.wallet is guaranteed to be a WagmiAdapter here (enforced by FhevmProvider)
  const adapter = config.wallet as WagmiAdapter;
  let wagmiConfig: unknown;

  try {
    wagmiConfig = adapter.useConfig();
  } catch (err) {
    throw new Error(WAGMI_PROVIDER_REQUIRED_ERROR, { cause: err });
  }

  return (
    <FhevmProviderInner config={config} queryClient={queryClient} wagmiConfig={wagmiConfig}>
      {children}
    </FhevmProviderInner>
  );
}

function FhevmProviderInner({
  config,
  queryClient: queryClientProp,
  wagmiConfig,
  children,
}: FhevmProviderProps & { wagmiConfig: unknown }) {
  const ambientQueryClient = useQueryClient();
  const queryClient = queryClientProp ?? ambientQueryClient;

  const onEventRef = useRef(config.advanced?.onEvent);
  useEffect(() => {
    onEventRef.current = config.advanced?.onEvent;
  });

  const relayer = useMemo(
    () => resolveRelayer(config),
    [config.chain.id, config.relayer, config.advanced?.threads, config.advanced?.integrityCheck],
  );
  const signer = useMemo(
    () => resolveWallet(config, wagmiConfig),
    [config.chain.id, wagmiConfig, config.wallet],
  );

  const signerLifecycleCallbacks = useMemo(
    () => ({
      onDisconnect: () => invalidateWalletLifecycleQueries(queryClient),
      onAccountChange: () => invalidateWalletLifecycleQueries(queryClient),
      onChainChange: () => invalidateWalletLifecycleQueries(queryClient),
    }),
    [queryClient],
  );

  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer,
        signer,
        storage: config.storage,
        keypairTTL: config.advanced?.keypairTTL,
        sessionTTL: config.advanced?.sessionTTL,
        onEvent: (...args) => onEventRef.current?.(...args),
        signerLifecycleCallbacks,
      }),
    [
      relayer,
      signer,
      config.storage,
      config.advanced?.keypairTTL,
      config.advanced?.sessionTTL,
      signerLifecycleCallbacks,
    ],
  );

  useEffect(() => () => sdk.terminate(), [sdk]);

  return <FhevmClientContext.Provider value={sdk}>{children}</FhevmClientContext.Provider>;
}

export function useFhevmClient(): ZamaSDK {
  const context = useContext(FhevmClientContext);

  if (!context) {
    throw new Error(
      "useFhevmClient must be used within a <FhevmProvider>. " +
        "Wrap your component tree in <FhevmProvider config={config}>.",
    );
  }

  return context;
}
