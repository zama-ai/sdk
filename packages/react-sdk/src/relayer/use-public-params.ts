"use client";

import { useQuery } from "../utils/query";
import { publicParamsQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export { publicParamsQueryOptions };

/** Shape of the FHE public parameters returned by the relayer. */
export interface PublicParamsData {
  /** The raw public parameters bytes (WASM-ready). */
  publicParams: Uint8Array;
  /** Unique identifier for this public params version. */
  publicParamsId: string;
}

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
