"use client";

import { DefaultWrappersRegistryAddresses, type Address } from "@zama-fhe/sdk";
import { tokenAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Looks up the plain token address for a given confidential token address.
 */
export function useTokenAddress({
  confidentialTokenAddress,
  wrappersRegistryAddresses = DefaultWrappersRegistryAddresses,
}: {
  confidentialTokenAddress: Address | undefined;
  wrappersRegistryAddresses?: Record<number, Address>;
}) {
  const sdk = useZamaSDK();
  const wrappersRegistryAddress = useWrappersRegistryAddress(wrappersRegistryAddresses);

  return useQuery<readonly [boolean, Address]>(
    tokenAddressQueryOptions(sdk.signer, {
      wrappersRegistryAddress,
      confidentialTokenAddress,
    }),
  );
}
