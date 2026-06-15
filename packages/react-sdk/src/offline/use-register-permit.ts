"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { CredentialPermitResult } from "@zama-fhe/sdk";
import { registerPermitMutationOptions, type RegisterPermitParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Persist an externally-signed credential permit. Pair with
 * `usePrepare({ kind: "CredentialPermit", ... })` after narrowing the
 * prepared value on `status === "PendingSignature"` — `Covered` results already
 * inline a `CredentialPermitResult` and need no follow-up call.
 *
 * Signer-optional: works without a configured signer (canonical
 * cross-process custody shape).
 *
 * @example
 * ```tsx
 * const { mutateAsync: registerPermit } = useRegisterPermit();
 * if (prepared.status === "PendingSignature") {
 *   await registerPermit({ prepared, signature });
 * }
 * ```
 */
export function useRegisterPermit<TContext = unknown>(
  options?: UseMutationOptions<CredentialPermitResult, Error, RegisterPermitParams, TContext>,
): UseMutationResult<CredentialPermitResult, Error, RegisterPermitParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<CredentialPermitResult, Error, RegisterPermitParams, TContext>({
    ...registerPermitMutationOptions(sdk),
    ...options,
  });
}
