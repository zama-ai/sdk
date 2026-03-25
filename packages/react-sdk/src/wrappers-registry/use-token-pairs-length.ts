"use client";

import { DefaultRegistryAddresses, type Address } from "@zama-fhe/sdk";
import { tokenPairsLengthQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Returns the total number of token wrapper pairs in the registry.
 */
export function useTokenPairsLength({
  registryAddresses = DefaultRegistryAddresses,
}: {
  registryAddresses?: Record<number, Address>;
} = {}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress(registryAddresses);

  return useQuery<bigint>(
    tokenPairsLengthQueryOptions(sdk.signer, {
      registryAddress,
    }),
  );
}
