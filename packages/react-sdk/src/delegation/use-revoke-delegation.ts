"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  revokeDelegationMutationOptions,
  zamaQueryKeys,
  type RevokeDelegationParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Revoke FHE decryption delegation for a confidential contract from a delegate address.
 *
 * @param address - Confidential contract address to revoke delegation on.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const revoke = useRevokeDelegation("0xToken");
 * revoke.mutate({ delegateAddress: "0xDelegate" });
 * ```
 */
export function useRevokeDelegation(
  address: Address,
  options?: UseMutationOptions<TransactionResult, Error, RevokeDelegationParams>,
) {
  const sdk = useZamaSDK();

  return useMutation<TransactionResult, Error, RevokeDelegationParams>({
    ...revokeDelegationMutationOptions(sdk, address),
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
