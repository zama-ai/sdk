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
export function tokenRevokeMutationOptions(sdk: ZamaSDK) {
  return {
    mutationKey: ["tokenRevoke"] as const,
    mutationFn: async (tokenAddresses: Address[]) => {
      const token = sdk.createReadonlyToken(tokenAddresses[0]!);
      await token.revoke();
    },
  };
}

/**
 * Revoke the session signature for the connected wallet.
 * Stored credentials remain intact, but the next decrypt operation
 * will require a fresh wallet signature.
 *
 * @example
 * ```tsx
 * const { mutate: tokenRevoke } = useTokenRevoke();
 * tokenRevoke(["0xTokenA", "0xTokenB"]);
 * ```
 */
export function useTokenRevoke() {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  return useMutation<void, Error, Address[]>({
    ...tokenRevokeMutationOptions(sdk),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: isAllowedQueryKeys.all });
    },
  });
}
