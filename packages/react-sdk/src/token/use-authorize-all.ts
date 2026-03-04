"use client";

import { useMutation } from "@tanstack/react-query";
import { authorizeAllMutationOptions, type AuthorizeAllParams } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Pre-authorize FHE decrypt credentials for a list of token addresses.
 * A single wallet signature covers all addresses, so subsequent decrypt
 * operations on any of these tokens reuse cached credentials.
 *
 * @example
 * ```tsx
 * const { mutateAsync: authorizeAll, isPending } = useAuthorizeAll();
 * // Call authorizeAll({ tokenAddresses: allTokenAddresses }) before any individual reveal
 * ```
 */
export function useAuthorizeAll() {
  const sdk = useZamaSDK();

  return useMutation<void, Error, AuthorizeAllParams>(authorizeAllMutationOptions(sdk));
}
