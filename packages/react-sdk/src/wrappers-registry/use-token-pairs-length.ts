"use client";

import { DefaultWrappersRegistryAddresses, type Address } from "@zama-fhe/sdk";
import { tokenPairsLengthQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Returns the total number of token wrapper pairs in the registry.
 */
export function useTokenPairsLength({
  wrappersRegistryAddresses = DefaultWrappersRegistryAddresses,
}: {
  wrappersRegistryAddresses?: Record<number, Address>;
} = {}) {
  const sdk = useZamaSDK();
  const wrappersRegistryAddress = useWrappersRegistryAddress(wrappersRegistryAddresses);

  return useQuery<bigint>(
    tokenPairsLengthQueryOptions(sdk.signer, {
      wrappersRegistryAddress,
      query: { enabled: !!wrappersRegistryAddress },
    }),
  );
}
