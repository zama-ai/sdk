"use client";

import { DefaultRegistryAddresses, type Address, type TokenWrapperPair } from "@zama-fhe/sdk";
import { tokenPairsQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Fetches all token wrapper pairs from the ConfidentialTokenWrappersRegistry
 * contract on the current chain.
 */
export function useTokenPairsRegistry({
  registryAddresses = DefaultRegistryAddresses,
}: {
  registryAddresses?: Record<number, Address>;
} = {}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress(registryAddresses);

  return useQuery<readonly TokenWrapperPair[]>(
    tokenPairsQueryOptions(sdk.signer, {
      registryAddress,
    }),
  );
}
