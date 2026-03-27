"use client";

import type { TokenWrapperPair } from "@zama-fhe/sdk";
import { tokenPairsQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Fetches all token wrapper pairs from the ConfidentialTokenWrappersRegistry
 * contract on the current chain.
 */
export function useTokenPairsRegistry() {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress();

  return useQuery<readonly TokenWrapperPair[]>(
    tokenPairsQueryOptions(sdk.signer, {
      registryAddress,
    }),
  );
}
