"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialTransferFromMutationOptions,
  invalidateAfterTransfer,
  type ConfidentialTransferFromParams,
} from "@zama-fhe/sdk/query";
import { useToken } from "../token/use-token";

/**
 * Operator transfer on behalf of another address. Caller must be an approved operator.
 * Invalidates balance caches on success.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption of the transfer amount failed
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param address - Address of the confidential token contract.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const transferFrom = useConfidentialTransferFrom("0xToken");
 * transferFrom.mutate({ from: "0xOwner", to: "0xRecipient", amount: 500n });
 * ```
 */
export function useConfidentialTransferFrom(
  address: Address,
  options?: UseMutationOptions<TransactionResult, Error, ConfidentialTransferFromParams, Address>,
) {
  const token = useToken(address);

  return useMutation<TransactionResult, Error, ConfidentialTransferFromParams, Address>({
    ...confidentialTransferFromMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterTransfer(context.client, token.address);
    },
  });
}
