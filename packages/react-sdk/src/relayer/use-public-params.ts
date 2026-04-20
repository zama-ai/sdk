"use client";

import type { PublicParamsData } from "@zama-fhe/sdk";
import { useQuery } from "../utils/query";
import { publicParamsQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Fetch FHE public parameters for a given bit size from the relayer.
 * Cached indefinitely since parameters do not change during a session.
 *
 * @param bits - The FHE bit size to fetch parameters for (e.g. 2048).
 * @returns Query result with `data: PublicParamsData | null`.
 *
 * @example
 * ```tsx
 * const { data: params } = usePublicParams(2048);
 * // params?.publicParams, params?.publicParamsId
 * ```
 */
export function usePublicParams(bits: number) {
  const sdk = useZamaSDK();
  return useQuery<PublicParamsData | null>(publicParamsQueryOptions(sdk, bits));
}
