"use client";

import { useQuery } from "@tanstack/react-query";
import type { TokenSDK } from "@zama-fhe/token-sdk";
import { useTokenSDK } from "../provider";

/**
 * Query key factory for the FHE public key query.
 * Use with `queryClient.invalidateQueries()` / `resetQueries()`.
 */
export const publicKeyQueryKeys = {
  /** Match the public key query. */
  all: ["publicKey"] as const,
} as const;

/** Shape of the FHE public key data returned by the relayer. */
export interface PublicKeyData {
  /** Unique identifier for this public key version. */
  publicKeyId: string;
  /** The raw FHE public key bytes. */
  publicKey: Uint8Array;
}

type PublicKeyResult = PublicKeyData | null;

/**
 * TanStack Query options factory for the FHE public key.
 *
 * @param sdk - A `TokenSDK` instance.
 * @returns Query options with `queryKey`, `queryFn`, and `staleTime`.
 */
export function publicKeyQueryOptions(sdk: TokenSDK) {
  return {
    queryKey: publicKeyQueryKeys.all,
    queryFn: () => sdk.relayer.getPublicKey() as Promise<PublicKeyResult>,
    staleTime: Infinity,
  } as const;
}

/**
 * Fetch the FHE network public key from the relayer.
 * Cached indefinitely since the key does not change during a session.
 *
 * @returns Query result with `data: PublicKeyData | null`.
 *
 * @example
 * ```tsx
 * const { data: publicKey } = usePublicKey();
 * // publicKey?.publicKeyId, publicKey?.publicKey
 * ```
 */
export function usePublicKey() {
  const sdk = useTokenSDK();
  return useQuery<PublicKeyResult, Error>(publicKeyQueryOptions(sdk));
}
