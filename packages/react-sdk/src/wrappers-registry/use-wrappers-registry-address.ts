"use client";

import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";

/**
 * Resolves the wrappers registry address for the current chain.
 * Uses the merged registry addresses from `sdk.registry` (built-in defaults
 * plus any `registryAddresses` overrides passed to `ZamaSDKConfig`).
 *
 * Returns `undefined` when the chain ID hasn't been fetched yet
 * or when no registry is configured for the connected chain.
 *
 * The chain ID is cached for 30 seconds (`staleTime`), so chain
 * switches may take up to 30s to reflect.
 */
export function useWrappersRegistryAddress(): Address | undefined {
  const sdk = useZamaSDK();

  const { data: chainId } = useQuery<number>({
    queryKey: zamaQueryKeys.wrappersRegistry.chainId(),
    queryFn: () => sdk.provider.getChainId(),
    staleTime: 30_000,
  });

  return chainId !== undefined ? sdk.registry.getAddress(chainId) : undefined;
}
