"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { Address, WildcardPermit } from "@zama-fhe/sdk";
import { grantPermitMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
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
 * - {@link TransportKeyPairExpiredError} — the transport key pair has expired
 *
 * @example
 * ```tsx
 * const { mutateAsync: grantPermit, isPending } = useGrantPermit();
 *
 * // Authorize decryption for any contracts with encrypted state:
 * // confidential tokens, auction contracts, governance contracts, etc.
 * await grantPermit([tokenAddress, auctionAddress, governanceAddress]);
 *
 * // Or request a V2 permissive permit covering every contract — an explicit
 * // opt-in; prefer a specific contract list unless coverage genuinely needs
 * // to be unbounded.
 * import { WILDCARD_PERMIT } from "@zama-fhe/sdk";
 * await grantPermit(WILDCARD_PERMIT);
 * ```
 */
export function useGrantPermit(
  options?: UseMutationOptions<void, Error, Address[] | WildcardPermit>,
) {
  const sdk = useZamaSDK();

  return useMutation<void, Error, Address[] | WildcardPermit>({
    ...grantPermitMutationOptions(sdk),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      options?.onSuccess?.(data, variables, onMutateResult, context);
      context.client.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
    },
  });
}
