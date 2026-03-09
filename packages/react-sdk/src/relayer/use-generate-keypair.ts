"use client";

import type { KeypairType } from "@zama-fhe/sdk";
import { useMutation } from "@tanstack/react-query";
import { useZamaSdk } from "../provider";

/**
 * Generate an FHE keypair via the relayer.
 * Returns a public/private key pair for use in decrypt authorization.
 *
 * @returns A mutation whose `mutate` takes no parameters.
 *
 * @example
 * ```tsx
 * const generateKeypair = useGenerateKeypair();
 * generateKeypair.mutate();
 * // generateKeypair.data?.publicKey, generateKeypair.data?.privateKey
 * ```
 */
export function useGenerateKeypair() {
  const sdk = useZamaSdk();
  return useMutation<KeypairType<string>, Error, void>({
    mutationFn: () => sdk.relayer.generateKeypair(),
  });
}
