"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { confidentialIsApprovedQueryOptions, signerAddressQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import type { UseZamaConfig } from "../token/use-token";
import { useSignerAddressSuspense } from "../use-signer-address";

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
  /** Token holder address. Defaults to the connected signer address. */
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
  // Skip signer-address resolution entirely when an explicit holder is supplied —
  // callers passing `holder` must never incur signer.getAddress() failures/retries.
  const signerAddressQuery = useQuery<Address>({
    ...signerAddressQueryOptions(sdk.signer),
    enabled: holder === undefined,
  });
  const resolvedHolder = holder ?? signerAddressQuery.data;
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
 * When `holder` is omitted, the connected signer address is resolved via a
 * suspending query (mirrors the non-suspense hook's implicit fallback).
 *
 * @example
 * ```tsx
 * // Implicit holder (connected signer)
 * const { data: isApproved } = useConfidentialIsApprovedSuspense({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 * });
 *
 * // Explicit holder
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
  const { data: signerAddress } = useSignerAddressSuspense();
  const resolvedHolder = holder ?? signerAddress;

  return useSuspenseQuery<boolean>(
    confidentialIsApprovedQueryOptions(sdk, tokenAddress, {
      holder: resolvedHolder,
      spender,
    }),
  );
}
