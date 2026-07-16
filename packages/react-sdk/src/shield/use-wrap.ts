"use client";

import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Address, TransactionResult } from "@zama-fhe/sdk";
import { invalidateAfterWrap, type WrapParams, wrapMutationOptions } from "@zama-fhe/sdk/query";
import { useWrappedToken } from "../token/use-wrapped-token";

/**
 * Wrap already-approved underlying ERC-20 into confidential tokens.
 *
 * Low-level escape hatch for splitting shield across two signatures: call
 * {@link useApproveUnderlying} first, then this. Product code should prefer
 * {@link useShield}, which routes and orchestrates approval in one call — do
 * not combine `useApproveUnderlying` + `useWrap` to recreate `useShield`.
 *
 * @param address - Address of the confidential wrapper contract.
 * @param options - React Query mutation options.
 * @throws if the user rejects the wallet prompt. {@link SigningRejectedError}
 * @throws if the ERC-20 balance is less than the amount. {@link InsufficientERC20BalanceError}
 * @throws if the allowance is less than the amount (approve first). {@link InsufficientAllowanceError}
 * @throws if the wrap transaction reverts. {@link TransactionRevertedError}
 *
 * @example
 * ```tsx
 * const approve = useApproveUnderlying("0xWrapper");
 * const wrap = useWrap("0xWrapper");
 * await approve.mutateAsync({ amount: 1000n });
 * await wrap.mutateAsync({ amount: 1000n });
 * ```
 */
export function useWrap(
  address: Address,
  options?: UseMutationOptions<TransactionResult, Error, WrapParams, Address>,
) {
  const token = useWrappedToken(address);

  return useMutation<TransactionResult, Error, WrapParams, Address>({
    ...wrapMutationOptions(token),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      invalidateAfterWrap(context.client, token.address);
    },
  });
}
