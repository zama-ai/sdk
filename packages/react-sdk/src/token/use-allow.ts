"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address, ZamaSDK } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";
import { isAllowedQueryKeys } from "./use-is-allowed";

/**
 * TanStack Query mutation options factory for token allow.
 *
 * @param sdk - A `ZamaSDK` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function allowMutationOptions(sdk: ZamaSDK) {
  return {
    mutationKey: ["allow"] as const,
    mutationFn: async (tokenAddresses: Address[]) => {
      await sdk.allow(...tokenAddresses);
    },
  };
}

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
export function useAllow() {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  return useMutation<void, Error, Address[]>({
    ...allowMutationOptions(sdk),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: isAllowedQueryKeys.all });
    },
  });
}
