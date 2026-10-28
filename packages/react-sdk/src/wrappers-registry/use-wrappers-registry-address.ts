"use client";

import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWalletAccount } from "../utils/wallet-account";

/**
 * Resolves the wrappers registry address for the chain the provider reads from.
 * Uses the registry addresses from `sdk.registry` (built-in defaults from chain configs).
 *
 * The provider's chain ID is cached for 30 seconds but refetched as soon as the
 * connected wallet switches chain, so a switch re-resolves the registry immediately.
 *
 * Returns `undefined` when the chain ID isn't known yet
 * or when no registry is configured for the chain.
 */
export function useWrappersRegistryAddress(): Address | undefined {
  const sdk = useZamaSDK();
  // Reads go through the provider, so its chain picks the registry. The wallet's chain only
  // keys the query: a viem or ethers provider pinned to one chain can differ from the wallet.
  const walletChainId = useWalletAccount(sdk)?.chainId;

  const { data: chainId } = useQuery<number>({
    queryKey: zamaQueryKeys.wrappersRegistry.chainId(walletChainId),
    queryFn: () => sdk.provider.getChainId(),
    staleTime: 30_000,
  });

  return chainId !== undefined ? sdk.registry.getAddress(chainId) : undefined;
}
