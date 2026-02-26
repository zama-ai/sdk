"use client";

import { useMutation } from "@tanstack/react-query";
import { ReadonlyToken, type Address, type ZamaSDK } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/**
 * TanStack Query mutation options factory for authorize-all.
 *
 * @param sdk - A `ZamaSDK` instance.
 * @returns Mutation options with `mutationKey` and `mutationFn`.
 */
export function authorizeAllMutationOptions(sdk: ZamaSDK) {
  return {
    mutationKey: ["authorizeAll"] as const,
    mutationFn: async (tokenAddresses: Address[]) => {
      const tokens = tokenAddresses.map((addr) => sdk.createReadonlyToken(addr));
      return ReadonlyToken.authorizeAll(tokens);
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
 * const { mutateAsync: authorizeAll, isPending } = useAuthorizeAll();
 * // Call authorizeAll(allTokenAddresses) before any individual reveal
 * ```
 */
export function useAuthorizeAll() {
  const sdk = useZamaSDK();

  return useMutation<void, Error, Address[]>(authorizeAllMutationOptions(sdk));
}
