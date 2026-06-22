"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { DecryptionPermitResult } from "@zama-fhe/sdk";
import { registerPermitMutationOptions, type RegisterPermitParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Persist an externally-signed decryption permit. Pair with
 * `usePrepare({ kind: "DecryptionPermit", ... })` and an external
 * `signTypedData` call over `preparedPermit.typedData`.
 *
 * Signer-optional: works without a configured signer (canonical
 * cross-process custody shape).
 *
 * @example
 * ```tsx
 * const { mutateAsync: registerPermit } = useRegisterPermit();
 * await registerPermit({ preparedPermit, signature });
 * ```
 */
export function useRegisterPermit<TContext = unknown>(
  options?: UseMutationOptions<DecryptionPermitResult, Error, RegisterPermitParams, TContext>,
): UseMutationResult<DecryptionPermitResult, Error, RegisterPermitParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<DecryptionPermitResult, Error, RegisterPermitParams, TContext>({
    ...registerPermitMutationOptions(sdk),
    ...options,
  });
}
