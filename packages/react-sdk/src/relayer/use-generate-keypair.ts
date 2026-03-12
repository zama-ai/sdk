"use client";

import { useMutation } from "@tanstack/react-query";
import { useZamaSDK } from "../provider";

/**
 * Generate an FHE keypair via the relayer.
 * Returns a public/private key pair for use in decrypt authorization.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link RelayerRequestFailedError} — relayer keypair generation request failed
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
  const sdk = useZamaSDK();
  return useMutation({
    mutationFn: () => sdk.relayer.generateKeypair(),
  });
}
