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

/** Configuration for {@link useIsAllowed}. */
export interface UseIsAllowedConfig {
  /** Contract addresses to check credentials against (at least one required). */
  contractAddresses: [Address, ...Address[]];
}

/**
 * Check whether a session signature is cached for the connected wallet
 * and covers the given contract addresses.
 * Returns `true` if decrypt operations can proceed without a wallet prompt.
 *
 * @example
 * ```tsx
 * const { data: allowed } = useIsAllowed({ contractAddresses: ["0xToken"] });
 * ```
 */
export function useIsAllowed(config: UseIsAllowedConfig) {
  const sdk = useZamaSDK();
  const addressQuery = useQuery<Address>({
    ...signerAddressQueryOptions(sdk),
  });
  const account = addressQuery.data;
  const baseOpts = account
    ? isAllowedQueryOptions(sdk, { account, contractAddresses: config.contractAddresses })
    : ({
        queryKey: zamaQueryKeys.isAllowed.all,
        queryFn: skipToken,
        enabled: false,
      } as const);

  return useQuery<boolean>(baseOpts);
}
