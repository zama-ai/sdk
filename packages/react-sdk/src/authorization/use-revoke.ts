"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { removeDecryptionQueries, revokeMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Revoke stored FHE decrypt credentials for a list of contract addresses.
 * This is not token-specific — it revokes the EIP-712 authorization for
 * any contract that uses FHE-encrypted values. Cached plaintext for the
 * current requester is also cleared, so the next decrypt operation on these
 * contracts will require a fresh wallet signature.
 *
 * @example
 * ```tsx
 * const { mutate: revoke } = useRevoke();
 *
 * // Revoke for any contracts: tokens, auctions, governance, etc.
 * revoke([tokenAddress, auctionAddress]);
 * ```
 */
export function useRevoke(options?: UseMutationOptions<void, Error, Address[]>) {
  const sdk = useZamaSDK();

  return useMutation<void, Error, Address[]>({
    ...revokeMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      removeDecryptionQueries(context.client);
      void context.client.invalidateQueries({ queryKey: zamaQueryKeys.isAllowed.all });
    },
  });
}
