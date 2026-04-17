"use client";

import type { TokenWrapperPair } from "@zama-fhe/sdk";
import { tokenPairsSliceQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWrappersRegistryAddress } from "./use-wrappers-registry-address";

/**
 * Fetches a range of token wrapper pairs from the registry (paginated).
 *
 * @param fromIndex - Start index (inclusive). Pass `undefined` to disable.
 * @param toIndex - End index (exclusive). Pass `undefined` to disable.
 */
export function useTokenPairsSlice({
  fromIndex,
  toIndex,
}: {
  fromIndex: bigint | undefined;
  toIndex: bigint | undefined;
}) {
  const sdk = useZamaSDK();
  const registryAddress = useWrappersRegistryAddress();

  return useQuery<readonly TokenWrapperPair[]>(
    tokenPairsSliceQueryOptions(sdk, {
      registryAddress,
      fromIndex,
      toIndex,
    }),
  );
}
