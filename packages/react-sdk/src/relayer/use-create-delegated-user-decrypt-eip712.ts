"use client";

import type { Address, KmsDelegatedUserDecryptEIP712Type } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { useZamaSdk } from "../provider";

/** Parameters for {@link useCreateDelegatedUserDecryptEIP712}. */
export interface CreateDelegatedUserDecryptEIP712Params {
  /** The FHE public key (hex-encoded). */
  publicKey: string;
  /** Contract addresses the credential authorizes decryption for. */
  contractAddresses: Address[];
  /** Address of the wallet that delegated decrypt authority. */
  delegatorAddress: string;
  /** Unix timestamp (seconds) when the credential becomes valid. */
  startTimestamp: number;
  /** Number of days the credential remains valid. Default: 1. */
  durationDays?: number;
}

/**
 * Create EIP-712 typed data for a delegated user decrypt credential.
 * Used when one wallet authorizes another to decrypt on its behalf.
 *
 * @returns A mutation whose `mutate` accepts {@link CreateDelegatedUserDecryptEIP712Params}.
 *
 * @example
 * ```tsx
 * const createEIP712 = useCreateDelegatedUserDecryptEIP712();
 * createEIP712.mutate({
 *   publicKey: keypair.publicKey,
 *   contractAddresses: ["0xToken"],
 *   delegatorAddress: "0xDelegator",
 *   startTimestamp: Math.floor(Date.now() / 1000),
 * });
 * ```
 */
export function useCreateDelegatedUserDecryptEIP712() {
  const sdk = useZamaSdk();
  return useMutation<
    KmsDelegatedUserDecryptEIP712Type,
    Error,
    CreateDelegatedUserDecryptEIP712Params
  >({
    mutationFn: ({
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    }) =>
      sdk.relayer.createDelegatedUserDecryptEIP712(
        publicKey,
        contractAddresses,
        delegatorAddress,
        startTimestamp,
        durationDays,
      ),
  });
}
