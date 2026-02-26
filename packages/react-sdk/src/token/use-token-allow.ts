"use client";

import { useMutation } from "@tanstack/react-query";
import { ReadonlyToken, type Address, type ZamaSDK } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/**
 * TanStack Query mutation options factory for token allow.
 *
 * @param sdk - A `ZamaSDK` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function tokenAllowMutationOptions(sdk: ZamaSDK) {
  return {
    mutationKey: ["tokenAllow"] as const,
    mutationFn: async (tokenAddresses: Address[]) => {
      const tokens = tokenAddresses.map((addr) => sdk.createReadonlyToken(addr));
      return ReadonlyToken.allow(...tokens);
    },
  };
}

/**
 * Pre-authorize FHE decrypt credentials for a list of token addresses.
 * A single wallet signature covers all addresses, so subsequent decrypt
 * operations on any of these tokens reuse cached credentials.
 *
 * @example
 * ```tsx
 * const { mutateAsync: tokenAllow, isPending } = useTokenAllow();
 * // Call tokenAllow(allTokenAddresses) before any individual reveal
 * ```
 */
export function useTokenAllow() {
  const sdk = useZamaSDK();

  return useMutation<void, Error, Address[]>(tokenAllowMutationOptions(sdk));
}
