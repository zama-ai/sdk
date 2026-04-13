"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { decryptBalanceAsMutationOptions, type DecryptBalanceAsParams } from "@zama-fhe/sdk/query";
import { useToken } from "../token/use-token";

/**
 * Decrypt another user's confidential balance as a delegate.
 *
 * @param tokenAddress - Address of the confidential token contract.
 * @param options - React Query mutation options.
 *
 * @example
 * ```tsx
 * const decryptAs = useDecryptBalanceAs("0xToken");
 * decryptAs.mutate({ delegatorAddress: "0xDelegator" });
 * // decryptAs.data => 1000n
 * ```
 */
export function useDecryptBalanceAs(
  tokenAddress: Address,
  options?: UseMutationOptions<bigint, Error, DecryptBalanceAsParams>,
) {
  const token = useToken({ tokenAddress });

  return useMutation<bigint, Error, DecryptBalanceAsParams>({
    ...decryptBalanceAsMutationOptions(token),
    ...options,
  });
}
