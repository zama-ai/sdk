"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ZamaSDK } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";
import { isAllowedQueryKeys } from "./use-is-allowed";

/**
 * TanStack Query mutation options factory for session revoke.
 *
 * @param sdk - A `ZamaSDK` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function revokeSessionMutationOptions(sdk: ZamaSDK) {
  return {
    mutationKey: ["revokeSession"] as const,
    mutationFn: async () => {
      await sdk.revokeSession();
    },
  };
}

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
export function useRevokeSession() {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    ...revokeSessionMutationOptions(sdk),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: isAllowedQueryKeys.all });
    },
  });
}
