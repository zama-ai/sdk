"use client";

import type { PublicKeyData } from "@zama-fhe/sdk";
import { useQuery } from "../utils/query";
import { publicKeyQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

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
  const sdk = useZamaSDK();
  return useQuery<PublicKeyData | null>(publicKeyQueryOptions(sdk));
}
