"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { revokeMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useFhevmClient } from "../provider";

/**
 * Revoke stored FHE credentials for a list of token addresses.
 * The next decrypt operation will require a fresh wallet signature.
 *
 * @example
 * ```tsx
 * const { mutate: revoke } = useRevoke();
 * revoke(["0xTokenA", "0xTokenB"]);
 * ```
 */
export function useRevoke(options?: UseMutationOptions<void, Error, Address[]>) {
  const sdk = useFhevmClient();

  return useMutation<void, Error, Address[]>({
    ...revokeMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.invalidateQueries({ queryKey: zamaQueryKeys.isAllowed.all });
    },
  });
}
