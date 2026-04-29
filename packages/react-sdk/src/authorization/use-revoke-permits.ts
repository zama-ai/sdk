"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { revokePermitsMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Revoke FHE permits, either selectively (pass a contract address list) or
 * fully (call without arguments). The keypair survives — use
 * {@link useClearCredentials} to also wipe the keypair.
 *
 * @example
 * ```tsx
 * const { mutate: revokePermits } = useRevokePermits();
 * revokePermits([tokenAddress]);
 * revokePermits(undefined); // clear every permit for current signer/chain
 * ```
 */
export function useRevokePermits(options?: UseMutationOptions<void, Error, Address[] | undefined>) {
  const sdk = useZamaSDK();

  return useMutation<void, Error, Address[] | undefined>({
    ...revokePermitsMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.isAllowed.all });
      context.client.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
    },
  });
}
