"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { allowMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useFhevmClient } from "../provider";

/**
 * Pre-authorize FHE decrypt credentials for a list of token addresses.
 * A single wallet signature covers all addresses, so subsequent decrypt
 * operations on any of these tokens reuse cached credentials.
 *
 * @example
 * ```tsx
 * const { mutateAsync: allow, isPending } = useAllow();
 * // Call allow(allTokenAddresses) before any individual reveal
 * ```
 */
export function useAllow(options?: UseMutationOptions<void, Error, Address[]>) {
  const sdk = useFhevmClient();

  return useMutation<void, Error, Address[]>({
    ...allowMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.invalidateQueries({ queryKey: zamaQueryKeys.isAllowed.all });
    },
  });
}
