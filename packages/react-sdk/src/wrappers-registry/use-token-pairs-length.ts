"use client";

import { tokenPairsLengthQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Returns the total number of token wrapper pairs in the registry.
 */
export function useTokenPairsLength() {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress();

  return useQuery<bigint>(
    tokenPairsLengthQueryOptions(sdk.signer, {
      registryAddress,
    }),
  );
}
