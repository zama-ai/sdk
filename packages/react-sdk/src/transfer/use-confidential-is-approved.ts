"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { confidentialIsApprovedQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useSignerAddress } from "../use-signer-address";
import { type UseZamaConfig } from "../token/use-token";

export { confidentialIsApprovedQueryOptions };

/** Configuration for {@link useConfidentialIsApproved}. */
export interface UseConfidentialIsApprovedConfig {
  /** Address of the confidential token contract. Pass `undefined` to disable the query. */
  tokenAddress: Address | undefined;
  /** Address to check approval for. Pass `undefined` to disable the query. */
  spender: Address | undefined;
  /** Token holder address. Defaults to the connected wallet. */
  holder?: Address;
}

/** Configuration for {@link useConfidentialIsApprovedSuspense}. */
export interface UseConfidentialIsApprovedSuspenseConfig extends UseZamaConfig {
  /** Address to check approval for. */
  spender: Address;
  /** Token holder address. Required — callers wanting the connected wallet should pass `useSignerAddressSuspense().data`. */
  holder: Address;
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
 *   holder: "0xHolder", // optional, defaults to connected wallet
 * });
 * ```
 */
export function useConfidentialIsApproved(
  config: UseConfidentialIsApprovedConfig,
  options?: Omit<UseQueryOptions<boolean>, "queryKey" | "queryFn">,
) {
  const { tokenAddress, spender, holder } = config;
  const sdk = useZamaSDK();
  const signerAddress = useSignerAddress();
  const resolvedHolder = holder ?? signerAddress;
  const baseOpts = confidentialIsApprovedQueryOptions(sdk, tokenAddress, {
    holder: resolvedHolder,
    spender,
  });

  return useQuery({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}

/**
 * Suspense variant of {@link useConfidentialIsApproved}.
 * Suspends rendering until the approval check resolves.
 * `holder` is required — callers wanting the connected wallet address should
 * compose with `useSignerAddressSuspense`:
 *
 * @example
 * ```tsx
 * const { data: myAddress } = useSignerAddressSuspense();
 * const { data: isApproved } = useConfidentialIsApprovedSuspense({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 *   holder: myAddress,
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
