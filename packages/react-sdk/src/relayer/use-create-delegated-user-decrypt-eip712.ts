"use client";

import type { KmsDelegatedUserDecryptEIP712Type } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { createDelegatedUserDecryptEIP712MutationOptions } from "@zama-fhe/sdk/query";
import type { CreateDelegatedUserDecryptEIP712Params } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

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
  const sdk = useZamaSDK();
  return useMutation<
    KmsDelegatedUserDecryptEIP712Type,
    Error,
    CreateDelegatedUserDecryptEIP712Params
  >(createDelegatedUserDecryptEIP712MutationOptions(sdk));
}
