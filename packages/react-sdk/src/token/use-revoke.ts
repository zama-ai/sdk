"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address, ZamaSDK } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";
import { isAllowedQueryKeys } from "./use-is-allowed";

/**
 * TanStack Query mutation options factory for token revoke.
 *
 * @param sdk - A `ZamaSDK` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function revokeMutationOptions(sdk: ZamaSDK) {
  return {
    mutationKey: ["revoke"] as const,
    mutationFn: async (tokenAddresses: Address[]) => {
      await sdk.revoke(...tokenAddresses);
    },
  };
}

/**
 * Revoke the session signature for the connected wallet.
 * Stored credentials remain intact, but the next decrypt operation
 * will require a fresh wallet signature.
 *
 * The addresses are passed through to the `credentials:revoked` event
 * for observability.
 *
 * @example
 * ```tsx
 * const { mutate: revoke } = useRevoke();
 * revoke(["0xTokenA", "0xTokenB"]);
 * ```
 */
export function useRevoke() {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  return useMutation<void, Error, Address[]>({
    ...revokeMutationOptions(sdk),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: isAllowedQueryKeys.all });
    },
  });
}
