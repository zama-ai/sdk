"use client";

import { DefaultRegistryAddresses, type Address } from "@zama-fhe/sdk";
import { confidentialTokenAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Looks up the confidential token address for a given plain token address.
 */
export function useConfidentialTokenAddress({
  tokenAddress,
  registryAddresses = DefaultRegistryAddresses,
}: {
  tokenAddress: Address | undefined;
  registryAddresses?: Record<number, Address>;
}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress(registryAddresses);

  return useQuery<readonly [boolean, Address]>(
    confidentialTokenAddressQueryOptions(sdk.signer, {
      registryAddress,
      tokenAddress,
    }),
  );
}
