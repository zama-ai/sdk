"use client";

import { useQuery } from "@tanstack/react-query";
import type { TokenSDK } from "@zama-fhe/token-sdk";
import { useTokenSDK } from "../provider";

/**
 * Query key factory for FHE public params queries.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const publicParamsQueryKeys = {
  /** Match all public params queries. */
  all: ["publicParams"] as const,
  /** Match public params query for a specific bit size. */
  bits: (bits: number) => ["publicParams", bits] as const,
} as const;

/** Shape of the FHE public parameters returned by the relayer. */
export interface PublicParamsData {
  /** The raw public parameters bytes (WASM-ready). */
  publicParams: Uint8Array;
  /** Unique identifier for this public params version. */
  publicParamsId: string;
}

type PublicParamsResult = PublicParamsData | null;

/**
 * TanStack Query options factory for FHE public parameters.
 *
 * @param sdk - A `TokenSDK` instance.
 * @param bits - The FHE bit size to fetch parameters for (e.g. 2048).
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function publicParamsQueryOptions(sdk: TokenSDK, bits: number) {
  return {
    queryKey: publicParamsQueryKeys.bits(bits),
    queryFn: () => sdk.relayer.getPublicParams(bits) as Promise<PublicParamsResult>,
    staleTime: Infinity,
  } as const;
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
  const sdk = useTokenSDK();
  return useQuery<PublicParamsResult, Error>(publicParamsQueryOptions(sdk, bits));
}
