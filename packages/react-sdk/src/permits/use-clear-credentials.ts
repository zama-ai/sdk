"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { clearCredentialsMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Wipe the keypair for the current signer and cascade-delete every permit
 * (across chains and delegators) referencing it. Useful for "log out"
 * handlers that should leave no trace.
 *
 * @example
 * ```tsx
 * const { mutate: clearCredentials } = useClearCredentials();
 * clearCredentials();
 * ```
 */
export function useClearCredentials(options?: UseMutationOptions<void>) {
  const sdk = useZamaSDK();

  return useMutation<void>({
    ...clearCredentialsMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
      context.client.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
    },
  });
}
