"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import {
  confidentialTransferFromMutationOptions,
  invalidateAfterTransfer,
  type ConfidentialTransferFromParams,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

/**
 * Operator transfer on behalf of another address. Caller must be an approved operator.
 * Invalidates balance caches on success.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link EncryptionFailedError} — FHE encryption of the transfer amount failed
 * - {@link TransactionRevertedError} — on-chain transaction reverted
 *
 * @param config - Token address (and optional wrapper) identifying the token.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const transferFrom = useConfidentialTransferFrom({ tokenAddress: "0x..." });
 * transferFrom.mutate({ from: "0xOwner", to: "0xRecipient", amount: 500n });
 * ```
 */
export function useConfidentialTransferFrom(
  config: UseZamaConfig,
  options?: UseMutationOptions<TransactionResult, Error, ConfidentialTransferFromParams, Address>,
) {
  const token = useToken(config);

  return useMutation<TransactionResult, Error, ConfidentialTransferFromParams, Address>({
    ...confidentialTransferFromMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterTransfer(context.client, config.tokenAddress);
    },
  });
}
