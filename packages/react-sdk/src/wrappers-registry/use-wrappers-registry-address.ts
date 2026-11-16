"use client";

import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWalletAccount } from "../utils/wallet-account";

/**
 * Registry address for the provider's chain, or `undefined` until the chain ID
 * is known or when no registry is configured for that chain.
 */
export function useWrappersRegistryAddress(): Address | undefined {
  const sdk = useZamaSDK();
  const walletChainId = useWalletAccount(sdk)?.chainId;

  const { data: chainId } = useQuery<number>({
    // Keyed by the wallet's chain: the wallet-lifecycle invalidation skips a first connect, so
    // without the key a wallet connecting on another chain would wait out staleTime.
    queryKey: zamaQueryKeys.wrappersRegistry.chainId(walletChainId),
    queryFn: () => sdk.provider.getChainId(),
    staleTime: 30_000,
  });

  return chainId !== undefined ? sdk.registry.getAddress(chainId) : undefined;
}
