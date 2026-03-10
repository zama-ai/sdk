"use client";

import type { EIP712TypedData } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { useZamaSDK } from "../provider";
import { type Address } from "@zama-fhe/sdk";

/** Parameters for {@link useCreateEIP712}. */
export interface CreateEIP712Params {
  /** The FHE public key (hex-encoded). */
  publicKey: `0x${string}`;
  /** Contract addresses the credential authorizes decryption for. */
  contractAddresses: Address[];
  /** Unix timestamp (seconds) when the credential becomes valid. */
  startTimestamp: number;
  /** Number of days the credential remains valid. Default: 1. */
  durationDays?: number;
}

/**
 * Create EIP-712 typed data for signing an FHE decrypt credential.
 * The returned typed data is signed by the wallet to authorize decryption.
 *
 * @returns A mutation whose `mutate` accepts {@link CreateEIP712Params}.
 *
 * @example
 * ```tsx
 * const createEIP712 = useCreateEIP712();
 * createEIP712.mutate({
 *   publicKey: keypair.publicKey,
 *   contractAddresses: ["0xToken"],
 *   startTimestamp: Math.floor(Date.now() / 1000),
 * });
 * ```
 */
export function useCreateEIP712() {
  const sdk = useZamaSDK();
  return useMutation<EIP712TypedData, Error, CreateEIP712Params>({
    mutationFn: ({ publicKey, contractAddresses, startTimestamp, durationDays }) =>
      sdk.relayer.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays),
  });
}
