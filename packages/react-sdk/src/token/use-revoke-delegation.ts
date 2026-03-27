"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { TransactionResult } from "@zama-fhe/sdk";
import {
  revokeDelegationMutationOptions,
  zamaQueryKeys,
  type RevokeDelegationParams,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Revoke FHE decryption delegation for a token from a delegate address.
 *
 * @param config - Token address identifying the confidential token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const revoke = useRevokeDelegation({ tokenAddress: "0x..." });
 * revoke.mutate({ delegateAddress: "0xDelegate" });
 * ```
 */
export function useRevokeDelegation(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, RevokeDelegationParams>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, RevokeDelegationParams>({
    ...revokeDelegationMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      try {
        options?.onSuccess?.(data, variables, onMutateResult, context);
      } finally {
        void context.client.invalidateQueries({ queryKey: zamaQueryKeys.delegationStatus.all });
      }
    },
  });
}
