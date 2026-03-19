"use client";

import {
  DefaultWrappersRegistryAddresses,
  type Address,
  type TokenWrapperPair,
} from "@zama-fhe/sdk";
import { tokenPairsQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Fetches all token wrapper pairs from the ConfidentialTokenWrappersRegistry
 * contract on the current chain.
 */
export function useTokenPairsRegistry({
  wrappersRegistryAddresses = DefaultWrappersRegistryAddresses,
}: {
  wrappersRegistryAddresses?: Record<number, Address>;
} = {}) {
  const sdk = useZamaSDK();
  const wrappersRegistryAddress = useWrappersRegistryAddress(wrappersRegistryAddresses);

  return useQuery<readonly TokenWrapperPair[]>(
    tokenPairsQueryOptions(sdk.signer, {
      wrappersRegistryAddress,
    }),
  );
}
