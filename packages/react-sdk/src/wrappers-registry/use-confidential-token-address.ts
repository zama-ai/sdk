"use client";

import { DefaultWrappersRegistryAddresses, type Address } from "@zama-fhe/sdk";
import { confidentialTokenAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Looks up the confidential token address for a given plain token address.
 */
export function useConfidentialTokenAddress({
  tokenAddress,
  wrappersRegistryAddresses = DefaultWrappersRegistryAddresses,
}: {
  tokenAddress: Address | undefined;
  wrappersRegistryAddresses?: Record<number, Address>;
}) {
  const sdk = useZamaSDK();
  const wrappersRegistryAddress = useWrappersRegistryAddress(wrappersRegistryAddresses);

  return useQuery<readonly [boolean, Address]>(
    confidentialTokenAddressQueryOptions(sdk.signer, {
      wrappersRegistryAddress,
      tokenAddress,
      query: { enabled: !!wrappersRegistryAddress && !!tokenAddress },
    }),
  );
}
