"use client";

import {
  DefaultWrappersRegistryAddresses,
  type Address,
  type TokenWrapperPair,
} from "@zama-fhe/sdk";
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
  wrappersRegistryAddresses = DefaultWrappersRegistryAddresses,
}: {
  index: bigint | undefined;
  wrappersRegistryAddresses?: Record<number, Address>;
}) {
  const sdk = useZamaSDK();
  const wrappersRegistryAddress = useWrappersRegistryAddress(wrappersRegistryAddresses);

  return useQuery<TokenWrapperPair>(
    tokenPairQueryOptions(sdk.signer, {
      wrappersRegistryAddress,
      index,
      query: {
        enabled: !!wrappersRegistryAddress && index !== undefined,
      },
    }),
  );
}
