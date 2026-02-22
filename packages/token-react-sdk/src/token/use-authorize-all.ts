"use client";

import { useMutation } from "@tanstack/react-query";
import { ReadonlyToken, type Hex } from "@zama-fhe/token-sdk";
import { useTokenSDK } from "../provider";

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
  const sdk = useTokenSDK();

  return useMutation<void, Error, Hex[]>({
    mutationKey: ["authorizeAll"],
    mutationFn: async (tokenAddresses) => {
      const tokens = tokenAddresses.map((addr) => sdk.createReadonlyToken(addr));
      return ReadonlyToken.authorizeAll(tokens);
    },
  });
}
