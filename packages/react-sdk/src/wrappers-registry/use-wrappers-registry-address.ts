"use client";

import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWalletAccount } from "../utils/wallet-account";

/**
 * Resolves the wrappers registry address for the current chain.
 * Uses the registry addresses from `sdk.registry` (built-in defaults from chain configs).
 *
 * Follows the connected wallet's chain, so a chain switch re-resolves the registry
 * immediately. Without a wallet, falls back to the provider's chain ID, cached for
 * 30 seconds.
 *
 * Returns `undefined` when the chain ID isn't known yet
 * or when no registry is configured for the chain.
 */
export function useWrappersRegistryAddress(): Address | undefined {
  const sdk = useZamaSDK();
  const walletChainId = useWalletAccount(sdk)?.chainId;

  const { data: providerChainId } = useQuery<number>({
    queryKey: zamaQueryKeys.wrappersRegistry.chainId(),
    queryFn: () => sdk.provider.getChainId(),
    staleTime: 30_000,
    enabled: walletChainId === undefined,
  });

  const chainId = walletChainId ?? providerChainId;
  return chainId !== undefined ? sdk.registry.getAddress(chainId) : undefined;
}
