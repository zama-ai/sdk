"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import { skipToken, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  confidentialIsApprovedQueryOptions,
  signerAddressQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

export { confidentialIsApprovedQueryOptions };

/** Configuration for {@link useConfidentialIsApproved}. */
export interface UseConfidentialIsApprovedConfig extends UseZamaConfig {
  /** Address to check approval for. Pass `undefined` to disable the query. */
  spender: Address | undefined;
  /** Token holder address. Defaults to the connected wallet. */
  holder?: Address;
}

/** Configuration for {@link useConfidentialIsApprovedSuspense}. */
export interface UseConfidentialIsApprovedSuspenseConfig extends UseZamaConfig {
  /** Address to check approval for. */
  spender: Address;
  /** Token holder address. Defaults to the connected wallet. */
  holder?: Address;
}

/**
 * Check if a spender is an approved operator for a given holder (defaults to connected wallet).
 *
 * @param config - Token address, spender, and optional holder to check.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApproved({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 *   holder: "0xHolder", // optional
 * });
 * ```
 */
export function useConfidentialIsApproved(
  config: UseConfidentialIsApprovedConfig,
  options?: Omit<UseQueryOptions<boolean>, "queryKey" | "queryFn">,
) {
  const { spender, holder, ...tokenConfig } = config;
  const userEnabled = options?.enabled;
  const token = useToken(tokenConfig);
  const holderQuery = useQuery<Address>({
    ...signerAddressQueryOptions(token.signer),
    enabled: holder === undefined,
  });
  const resolvedHolder = holder ?? holderQuery.data;

  const baseOpts =
    spender && resolvedHolder
      ? confidentialIsApprovedQueryOptions(token.signer, token.address, {
          holder: resolvedHolder,
          spender,
        })
      : {
          queryKey: zamaQueryKeys.confidentialIsApproved.token(config.tokenAddress),
          queryFn: skipToken,
        };
  return useQuery({
    ...baseOpts,
    ...options,
    enabled: ("enabled" in baseOpts ? (baseOpts.enabled ?? true) : true) && (userEnabled ?? true),
  });
}

/**
 * Suspense variant of {@link useConfidentialIsApproved}.
 * Suspends rendering until the approval check resolves.
 *
 * @param config - Token address, spender, and optional holder to check.
 * @returns Suspense query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApprovedSuspense({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 *   holder: "0xHolder", // optional
 * });
 * ```
 */
export function useConfidentialIsApprovedSuspense(config: UseConfidentialIsApprovedSuspenseConfig) {
  const { spender, holder, ...tokenConfig } = config;
  const token = useToken(tokenConfig);
  const addressQuery = useSuspenseQuery<Address>({
    ...signerAddressQueryOptions(token.signer),
  });
  const resolvedHolder = holder ?? addressQuery.data;

  return useSuspenseQuery<boolean>({
    ...confidentialIsApprovedQueryOptions(token.signer, token.address, {
      holder: resolvedHolder,
      spender,
    }),
  });
}
