"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { allowMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Sign an EIP-712 message authorizing decryption of confidential handles
 * for a list of contract addresses. This is not token-specific — any
 * contract that uses FHE-encrypted values (tokens, DeFi vaults, games, etc.)
 * can be authorized in a single wallet signature. Subsequent decrypt
 * operations on any of these contracts reuse cached credentials.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected the wallet prompt
 * - {@link KeypairExpiredError} — the re-encryption keypair has expired
 *
 * @example
 * ```tsx
 * const { mutateAsync: allow, isPending } = useAllow();
 *
 * // Authorize decryption for any contracts with encrypted state:
 * // confidential tokens, auction contracts, governance contracts, etc.
 * await allow([tokenAddress, auctionAddress, governanceAddress]);
 * ```
 */
export function useAllow(options?: UseMutationOptions<void, Error, Address[]>) {
  const sdk = useZamaSDK();

  return useMutation<void, Error, Address[]>({
    ...allowMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.isAllowed.all });
    },
  });
}
