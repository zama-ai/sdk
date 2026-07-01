"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialTransferFromAndCallMutationOptions,
  invalidateAfterTransfer,
  type ConfidentialTransferFromAndCallParams,
} from "@zama-fhe/sdk/query";
import { useToken } from "../token/use-token";

/**
 * Operator-initiated `confidentialTransferFromAndCall` — an ERC-7984 confidential
 * transfer on behalf of another address that also invokes the recipient's
 * receiver hook in a single transaction. Caller must be an approved operator
 * for `from`. The caller crafts the opaque `data` payload; the SDK does not
 * encode, validate, or interpret it. Invalidates balance caches on success.
 *
 * @param address - Address of the confidential token contract.
 * @param options - React Query mutation options.
 * @returns Mutation result whose `data` is the {@link TransactionResult} on success.
 *
 * @throws if the user rejects the wallet prompt. {@link SigningRejectedError}
 * @throws if FHE encryption of the transfer amount fails. {@link EncryptionFailedError}
 * @throws if the on-chain transaction reverts. {@link TransactionRevertedError}
 *
 * @example
 * ```tsx
 * const transferFromAndCall = useConfidentialTransferFromAndCall("0xToken");
 * transferFromAndCall.mutate({
 *   from: "0xOwner",
 *   to: "0xReceiverContract",
 *   amount: 500n,
 *   data: "0xabcd",
 * });
 * ```
 */
export function useConfidentialTransferFromAndCall(
  address: Address,
  options?: UseMutationOptions<
    TransactionResult,
    Error,
    ConfidentialTransferFromAndCallParams,
    Address
  >,
) {
  const token = useToken(address);

  return useMutation<TransactionResult, Error, ConfidentialTransferFromAndCallParams, Address>({
    ...confidentialTransferFromAndCallMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterTransfer(context.client, token.address);
    },
  });
}
