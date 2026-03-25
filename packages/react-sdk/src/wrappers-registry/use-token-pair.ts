"use client";

import { DefaultRegistryAddresses, type Address, type TokenWrapperPair } from "@zama-fhe/sdk";
import { tokenPairQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Fetches a single token wrapper pair by index from the registry.
 *
 * @param index - Zero-based pair index. Pass `undefined` to disable.
 */
export function useTokenPair({
  index,
  registryAddresses = DefaultRegistryAddresses,
}: {
  index: bigint | undefined;
  registryAddresses?: Record<number, Address>;
}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress(registryAddresses);

  return useQuery<TokenWrapperPair>(
    tokenPairQueryOptions(sdk.signer, {
      registryAddress,
      index,
    }),
  );
}
