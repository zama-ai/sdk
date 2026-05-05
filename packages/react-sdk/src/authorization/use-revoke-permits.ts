"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { revokePermitsMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Revoke FHE permits for the current signer.
 *
 * - Called with no arguments: every permit is removed across all chains and
 *   delegators. The keypair survives — use {@link useClearCredentials} to also
 *   wipe the keypair.
 * - Called with a contract list: only direct-decrypt permits on the current
 *   chain whose payload touches a listed address are removed. Delegated
 *   permits are not touched in this mode.
 *
 * @example
 * ```tsx
 * const { mutate: revokePermits } = useRevokePermits();
 * revokePermits([tokenAddress]); // direct-decrypt scope, current chain
 * revokePermits();               // every permit, all chains, all delegators
 * ```
 */
export function useRevokePermits(options?: UseMutationOptions<void, Error, Address[] | void>) {
  const sdk = useZamaSDK();

  return useMutation<void, Error, Address[] | void>({
    ...revokePermitsMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.isAllowed.all });
      context.client.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
    },
  });
}
