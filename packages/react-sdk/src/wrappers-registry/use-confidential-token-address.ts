"use client";

import type { Address } from "@zama-fhe/sdk";
import { confidentialTokenAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Looks up the confidential token address for a given plain token address.
 */
export function useConfidentialTokenAddress({
  tokenAddress,
}: {
  tokenAddress: Address | undefined;
}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress();

  return useQuery<readonly [boolean, Address]>(
    confidentialTokenAddressQueryOptions(sdk, {
      registryAddress,
      tokenAddress,
    }),
  );
}
