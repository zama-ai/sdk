"use client";

import { useQuery } from "../utils/query";
import { publicKeyQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export { publicKeyQueryOptions };

/** Shape of the FHE public key data returned by the relayer. */
export interface PublicKeyData {
  /** Unique identifier for this public key version. */
  publicKeyId: string;
  /** The raw FHE public key bytes. */
  publicKey: Uint8Array;
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
  const sdk = useZamaSDK();
  return useQuery<PublicKeyData | null>({
    ...publicKeyQueryOptions(sdk),
  });
}
