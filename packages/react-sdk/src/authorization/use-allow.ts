"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { allowMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Sign EIP-712 messages authorizing FHE decryption for a list of contract addresses.
 *
 * For ≤10 addresses the SDK produces a single wallet signature. For >10 addresses
 * the SDK splits into batches of 10 and presents sequential signature prompts — one
 * per batch. The mutation rejects if any batch signing fails.
 *
 * Errors are {@link ZamaError} subclasses — use `instanceof` to handle specific failures:
 * - {@link SigningRejectedError} — user rejected a wallet prompt
 * - {@link KeypairExpiredError} — the re-encryption keypair has expired
 *
 * @example
 * ```tsx
 * const { mutateAsync: allow, isPending } = useAllow();
 *
 * // Authorize decryption for any contracts with FHE-encrypted state:
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
      void context.client.invalidateQueries({
        queryKey: zamaQueryKeys.isAllowed.all,
      });
    },
  });
}
