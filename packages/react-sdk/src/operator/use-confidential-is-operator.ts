"use client";

import { useQuery, useSuspenseQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { confidentialIsOperatorQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";

export interface UseConfidentialIsOperatorConfig {
  /** Address of the confidential token contract. The query is disabled while `undefined`. */
  address: Address | undefined;
  /** Address to check operator status for. The query is disabled while `undefined`. */
  spender: Address | undefined;
  /** Token holder address. The query is disabled while `undefined`. */
  holder: Address | undefined;
}

export interface UseConfidentialIsOperatorSuspenseConfig {
  /** Address of the confidential token contract. */
  address: Address;
  /** Address to check operator status for. */
  spender: Address;
  /** Token holder address. */
  holder: Address;
}

/**
 * Check if a spender is an approved operator for a holder.
 *
 * @param config - Token address, spender, and holder to check.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isOperator } = useConfidentialIsOperator({
 *   address: "0xToken",
 *   spender: "0xSpender",
 *   holder: "0xHolder",
 * });
 * ```
 */
export function useConfidentialIsOperator(
  config: UseConfidentialIsOperatorConfig,
  options?: Omit<UseQueryOptions<boolean>, "queryKey" | "queryFn">,
) {
  const { address, spender, holder } = config;
  const sdk = useZamaSDK();
  const baseOpts = confidentialIsOperatorQueryOptions(sdk, address, { holder, spender });

  return useQuery({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}

/**
 * Suspense variant of {@link useConfidentialIsOperator}. Suspends rendering
 * until the operator check resolves.
 *
 * @example
 * ```tsx
 * const { data: isOperator } = useConfidentialIsOperatorSuspense({
 *   address: "0xToken",
 *   spender: "0xSpender",
 *   holder: "0xHolder",
 * });
 * ```
 */
export function useConfidentialIsOperatorSuspense(config: UseConfidentialIsOperatorSuspenseConfig) {
  const { spender, holder, address } = config;
  const sdk = useZamaSDK();

  return useSuspenseQuery<boolean>(
    confidentialIsOperatorQueryOptions(sdk, address, { holder, spender }),
  );
}
