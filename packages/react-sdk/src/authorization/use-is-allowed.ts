"use client";

import { useQuery } from "../utils/query";
import type { Address } from "@zama-fhe/sdk";
import { isAllowedQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

/** Configuration for {@link useIsAllowed}. */
export interface UseIsAllowedConfig {
  /** Contract addresses to check credentials against (at least one required). */
  contractAddresses: [Address, ...Address[]];
}

/**
 * Check whether a session signature is cached for the connected signer and
 * covers the given contract addresses. Returns `true` if decrypt operations
 * can proceed without a wallet prompt.
 *
 * @example
 * ```tsx
 * const { data: allowed } = useIsAllowed({ contractAddresses: ["0xToken"] });
 * ```
 */
export function useIsAllowed(config: UseIsAllowedConfig) {
  const sdk = useZamaSDK();
  return useQuery<boolean>(isAllowedQueryOptions(sdk, config));
}
