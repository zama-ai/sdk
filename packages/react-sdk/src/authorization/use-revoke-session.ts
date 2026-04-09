"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { revokeSessionMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Revoke the session signature for the connected wallet without
 * specifying contract addresses. Useful for wallet disconnect handlers.
 *
 * @example
 * ```tsx
 * const { mutate: revokeSession } = useRevokeSession();
 * revokeSession();
 * ```
 */
export function useRevokeSession(options?: UseMutationOptions<void>) {
  const sdk = useZamaSDK();

  return useMutation<void>({
    ...revokeSessionMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      void context.client.invalidateQueries({ queryKey: zamaQueryKeys.isAllowed.all });
      context.client.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
    },
  });
}
