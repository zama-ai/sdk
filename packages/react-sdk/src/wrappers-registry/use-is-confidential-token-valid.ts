"use client";

import type { Address } from "@zama-fhe/sdk";
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
}: {
  confidentialTokenAddress: Address | undefined;
}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress();

  return useQuery<boolean>(
    isConfidentialTokenValidQueryOptions(sdk, {
      registryAddress,
      confidentialTokenAddress,
    }),
  );
}
