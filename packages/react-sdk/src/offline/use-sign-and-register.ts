"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { CredentialPermitResult } from "@zama-fhe/sdk";
import { signAndRegisterMutationOptions, type SignAndRegisterParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Tier-2 mutation: bundled in-process prepare + signTypedData + register for
 * a credential permit. Mirrors `sdk.offlineSigning.signAndRegister(...)`. Returns
 * the registered permit metadata. When every requested contract is already
 * cached, the underlying `prepare` short-circuits to the `Covered` variant
 * and its inlined `result` is returned without prompting the signer.
 *
 * Requires a signer with `signTypedData` (mandatory on every
 * {@link GenericSigner}).
 *
 * Cache invalidation flows from SDK events — the hook does not invalidate
 * directly.
 *
 * @example
 * ```tsx
 * const { mutateAsync: signAndRegister } = useSignAndRegister();
 * await signAndRegister({
 *   request: { kind: "CredentialPermit", from: userAddress, contracts: [tokenAddress] },
 * });
 * ```
 */
export function useSignAndRegister<TContext = unknown>(
  options?: UseMutationOptions<CredentialPermitResult, Error, SignAndRegisterParams, TContext>,
): UseMutationResult<CredentialPermitResult, Error, SignAndRegisterParams, TContext> {
  const sdk = useZamaSDK();
  return useMutation<CredentialPermitResult, Error, SignAndRegisterParams, TContext>({
    ...signAndRegisterMutationOptions(sdk),
    ...options,
  });
}

export type { SignAndRegisterParams, CredentialPermitResult };
