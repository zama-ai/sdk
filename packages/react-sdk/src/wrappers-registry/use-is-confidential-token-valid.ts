"use client";

import { DefaultWrappersRegistryAddresses, type Address } from "@zama-fhe/sdk";
import { isConfidentialTokenValidQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Checks whether a confidential token is registered and valid in the
 * on-chain wrappers registry.
 *
 * @param confidentialTokenAddress - The confidential token to check. Pass `undefined` to disable.
 */
export function useIsConfidentialTokenValid({
  confidentialTokenAddress,
  wrappersRegistryAddresses = DefaultWrappersRegistryAddresses,
}: {
  confidentialTokenAddress: Address | undefined;
  wrappersRegistryAddresses?: Record<number, Address>;
}) {
  const sdk = useZamaSDK();
  const wrappersRegistryAddress = useWrappersRegistryAddress(wrappersRegistryAddresses);

  return useQuery<boolean>(
    isConfidentialTokenValidQueryOptions(sdk.signer, {
      wrappersRegistryAddress,
      confidentialTokenAddress,
    }),
  );
}
