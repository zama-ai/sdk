"use client";

import { useQuery } from "../utils/query";
import { skipToken } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  isAllowedQueryOptions,
  signerAddressQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/**
 * Check whether a session signature is cached for the connected wallet.
 * Returns `true` if decrypt operations can proceed without a wallet prompt.
 *
 * @example
 * ```tsx
 * const { data: allowed } = useIsAllowed();
 * ```
 */
export function useIsAllowed() {
  const sdk = useZamaSDK();
  const addressQuery = useQuery<Address>({
    ...signerAddressQueryOptions(sdk.signer),
  });
  const account = addressQuery.data as Address | undefined;
  const baseOpts = account
    ? isAllowedQueryOptions(sdk, { account })
    : {
        queryKey: zamaQueryKeys.isAllowed.all,
        queryFn: skipToken,
      };
  const factoryEnabled = "enabled" in baseOpts ? (baseOpts.enabled ?? true) : true;

  return useQuery({
    ...baseOpts,
    enabled: factoryEnabled,
  });
}
