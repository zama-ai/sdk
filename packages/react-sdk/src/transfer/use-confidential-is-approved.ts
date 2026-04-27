"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { confidentialIsApprovedQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export { confidentialIsApprovedQueryOptions };

export interface UseConfidentialIsApprovedConfig {
  /** Address of the confidential token contract. The query is disabled while `undefined`. */
  tokenAddress: Address | undefined;
  /** Address to check approval for. The query is disabled while `undefined`. */
  spender: Address | undefined;
  /** Token holder address. The query is disabled while `undefined`. */
  holder: Address | undefined;
}

export interface UseConfidentialIsApprovedSuspenseConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** Address to check approval for. */
  spender: Address;
  /** Token holder address. */
  holder: Address;
}

/**
 * Check if a spender is an approved operator for a holder.
 * @param config - Token address, spender, and optional holder to check.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApproved({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 *   holder: "0xHolder",
 * });
 * ```
 */
export function useConfidentialIsApproved(
  config: UseConfidentialIsApprovedConfig,
  options?: Omit<UseQueryOptions<boolean>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, spender, holder } = config;
  const sdk = useZamaSDK();
  const baseOpts = confidentialIsApprovedQueryOptions(sdk, tokenAddress, {
    holder,
    spender,
  });

  return useQuery({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}

/**
 * Suspense variant of {@link useConfidentialIsApproved}. Suspends rendering
 * until the approval check resolves.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApprovedSuspense({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 *   holder: "0xHolder",
 * });
 * ```
 */
export function useConfidentialIsApprovedSuspense(config: UseConfidentialIsApprovedSuspenseConfig) {
  const { spender, holder, tokenAddress } = config;
  const sdk = useZamaSDK();

  return useSuspenseQuery<boolean>(
    confidentialIsApprovedQueryOptions(sdk, tokenAddress, {
      holder,
      spender,
    }),
  );
}
