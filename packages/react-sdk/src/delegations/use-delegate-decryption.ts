"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  delegateDecryptionMutationOptions,
  zamaQueryKeys,
  type DelegateDecryptionParams,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Delegate FHE decryption rights for a confidential contract to another address
 * via the on-chain ACL.
 *
 * @param address - Confidential contract address to delegate on.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const delegate = useDelegateDecryption("0xToken");
 * delegate.mutate({ delegateAddress: "0xDelegate" });
 * ```
 */
export function useDelegateDecryption(
  address: Address,
  options?: UseMutationOptions<TransactionResult, Error, DelegateDecryptionParams>,
) {
  const sdk = useZamaSDK();

  return useMutation<TransactionResult, Error, DelegateDecryptionParams>({
    ...delegateDecryptionMutationOptions(sdk, address),
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
