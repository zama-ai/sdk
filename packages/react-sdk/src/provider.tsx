"use client";

import type {
  GenericSigner,
  GenericStorage,
  RelayerSDK,
  ZamaConfig,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
import { ZamaSDK } from "@zama-fhe/sdk";
import { invalidateWalletLifecycleQueries } from "@zama-fhe/sdk/query";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

/** Config-based props (preferred). */
interface ZamaProviderConfigProps extends PropsWithChildren {
  config: ZamaConfig;
  relayer?: never;
}

/** Legacy prop-based API for apps that don't use createZamaConfig. */
interface ZamaProviderLegacyProps extends PropsWithChildren {
  config?: never;
  relayer: RelayerSDK;
  signer: GenericSigner;
  storage: GenericStorage;
  sessionStorage?: GenericStorage;
  keypairTTL?: number;
  sessionTTL?: number;
  registryTTL?: number;
  onEvent?: ZamaSDKEventListener;
}

/** Props for {@link ZamaProvider}. */
export type ZamaProviderProps = ZamaProviderConfigProps | ZamaProviderLegacyProps;

const ZamaSDKContext = createContext<ZamaSDK | null>(null);

/**
 * Provides a {@link ZamaSDK} instance to all descendant hooks.
 *
 * @example
 * ```tsx
 * <ZamaProvider config={zamaConfig}>
 *   <App />
 * </ZamaProvider>
 * ```
 */
export function ZamaProvider(props: ZamaProviderProps) {
  const { children } = props;
  const queryClient = useQueryClient();

  // Normalize: config-based or legacy props → unified shape.
  // For the legacy path, individual props are spread into deps so the object
  // is only recreated when an actual prop changes.
  const relayer = props.config?.relayer ?? (props as ZamaProviderLegacyProps).relayer;
  const signer = props.config?.signer ?? (props as ZamaProviderLegacyProps).signer;
  const storage = props.config?.storage ?? (props as ZamaProviderLegacyProps).storage;
  const sessionStorage =
    props.config?.sessionStorage ?? (props as ZamaProviderLegacyProps).sessionStorage;
  const keypairTTL = props.config?.keypairTTL ?? (props as ZamaProviderLegacyProps).keypairTTL;
  const sessionTTL = props.config?.sessionTTL ?? (props as ZamaProviderLegacyProps).sessionTTL;
  const registryTTL = props.config?.registryTTL ?? (props as ZamaProviderLegacyProps).registryTTL;
  const onEvent = props.config?.onEvent ?? (props as ZamaProviderLegacyProps).onEvent;
  const chains = props.config?.chains;

  // Stabilize onEvent so an inline arrow doesn't recreate the SDK every render.
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const signerLifecycleCallbacks = useMemo(
    () =>
      signer?.subscribe
        ? {
            onDisconnect: () => invalidateWalletLifecycleQueries(queryClient),
            onAccountChange: () => invalidateWalletLifecycleQueries(queryClient),
            onChainChange: () => invalidateWalletLifecycleQueries(queryClient),
          }
        : undefined,
    [queryClient, signer],
  );

  const sdk = useMemo(
    () =>
      new ZamaSDK({
        chains,
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL,
        sessionTTL,
        registryTTL,
        onEvent: onEventRef.current,
        signerLifecycleCallbacks,
      }),
    [
      chains,
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL,
      sessionTTL,
      registryTTL,
      signerLifecycleCallbacks,
    ],
  );

  useEffect(() => () => sdk.dispose(), [sdk]);

  return <ZamaSDKContext.Provider value={sdk}>{children}</ZamaSDKContext.Provider>;
}

/**
 * Access the {@link ZamaSDK} instance from context.
 * Throws if called outside a {@link ZamaProvider}.
 *
 * @example
 * ```tsx
 * const sdk = useZamaSDK();
 * const token = sdk.createReadonlyToken("0x...");
 * ```
 */
export function useZamaSDK(): ZamaSDK {
  const context = useContext(ZamaSDKContext);

  if (!context) {
    throw new Error(
      "useZamaSDK must be used within a <ZamaProvider>. " +
        "Wrap your component tree in <ZamaProvider config={createZamaConfig(...)}>.",
    );
  }

  return context;
}
