"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { revokeMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Revoke stored FHE credentials for a list of token addresses.
 * The next decrypt operation will require a fresh wallet signature.
 *
 * @example
 * ```tsx
 * const { mutate: revokeTokens } = useRevokeTokens();
 * revokeTokens(["0xTokenA", "0xTokenB"]);
 * ```
 */
export function useRevokeTokens(options?: UseMutationOptions<void, Error, Address[]>) {
  const sdk = useZamaSDK();

  return useMutation<void, Error, Address[]>({
    ...revokeMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      void context.client.invalidateQueries({ queryKey: zamaQueryKeys.isAllowed.all });
    },
  });
}
