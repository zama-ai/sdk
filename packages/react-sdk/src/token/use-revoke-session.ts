"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { revokeSessionMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useFhevmClient } from "../provider";

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
export function useRevokeSession(options?: UseMutationOptions<void, Error, void>) {
  const sdk = useFhevmClient();

  return useMutation<void, Error, void>({
    ...revokeSessionMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.invalidateQueries({ queryKey: zamaQueryKeys.isAllowed.all });
    },
  });
}
