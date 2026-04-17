"use client";

import type { TokenWrapperPair } from "@zama-fhe/sdk";
import { tokenPairQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Fetches a single token wrapper pair by index from the registry.
 *
 * @param index - Zero-based pair index. Pass `undefined` to disable.
 */
export function useTokenPair({ index }: { index: bigint | undefined }) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress();

  return useQuery<TokenWrapperPair>(
    tokenPairQueryOptions(sdk, {
      registryAddress,
      index,
    }),
  );
}
