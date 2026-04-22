"use client";

import type { EIP712TypedData } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { createEIP712MutationOptions } from "@zama-fhe/sdk/query";
import type { CreateEIP712Params } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

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
  return useMutation<EIP712TypedData, Error, CreateEIP712Params>(createEIP712MutationOptions(sdk));
}
