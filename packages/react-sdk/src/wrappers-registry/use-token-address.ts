"use client";

import type { Address } from "@zama-fhe/sdk";
import { tokenAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Looks up the plain token address for a given confidential token address.
 */
export function useTokenAddress({
  confidentialTokenAddress,
}: {
  confidentialTokenAddress: Address | undefined;
}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress();

  return useQuery<readonly [boolean, Address]>(
    tokenAddressQueryOptions(sdk.signer, {
      registryAddress,
      confidentialTokenAddress,
    }),
  );
}
