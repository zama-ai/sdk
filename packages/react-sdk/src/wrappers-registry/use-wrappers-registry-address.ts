"use client";

import { DefaultWrappersRegistryAddresses, type Address } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";

/**
 * Resolves the wrappers registry address for the current chain.
 * Returns `undefined` when the chain ID hasn't been fetched yet
 * or when no registry is configured for the connected chain.
 */
export function useWrappersRegistryAddress(
  wrappersRegistryAddresses: Record<number, Address> = DefaultWrappersRegistryAddresses,
): Address | undefined {
  const sdk = useZamaSDK();

  const { data: chainId } = useQuery<number>({
    queryKey: ["zama.wrappersRegistry.chainId"],
    queryFn: () => sdk.signer.getChainId(),
    staleTime: 30_000,
  });

  return chainId !== undefined ? wrappersRegistryAddresses[chainId] : undefined;
}
