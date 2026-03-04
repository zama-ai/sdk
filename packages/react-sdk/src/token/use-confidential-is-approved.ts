"use client";

import { useQuery, useSuspenseQuery, skipToken, type UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import {
  confidentialIsApprovedQueryOptions,
  hashFn,
  signerAddressQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { useToken, type UseZamaConfig } from "./use-token";

export const confidentialIsApprovedQueryKeys = zamaQueryKeys.confidentialIsApproved;
export { confidentialIsApprovedQueryOptions };

/** Configuration for {@link useConfidentialIsApproved}. */
export interface UseConfidentialIsApprovedConfig extends UseZamaConfig {
  /** Address to check approval for. Pass `undefined` to disable the query. */
  spender: Address | undefined;
}

/** Configuration for {@link useConfidentialIsApprovedSuspense}. */
export interface UseConfidentialIsApprovedSuspenseConfig extends UseZamaConfig {
  /** Address to check approval for. */
  spender: Address;
}

/**
 * Check if a spender is an approved operator for the connected wallet.
 *
 * @param config - Token address and spender to check.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApproved({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 * });
 * ```
 */
export function useConfidentialIsApproved(
  config: UseConfidentialIsApprovedConfig,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
) {
  const { spender, ...tokenConfig } = config;
  const token = useToken(tokenConfig);
  const addressQuery = useQuery({
    ...signerAddressQueryOptions(token.signer, token.address),
    queryKeyHashFn: hashFn,
  });
  const owner = addressQuery.data as Address | undefined;

  return useQuery({
    ...(spender
      ? confidentialIsApprovedQueryOptions(token.signer, token.address, { owner, spender })
      : {
          queryKey: confidentialIsApprovedQueryKeys.token(config.tokenAddress),
          queryFn: skipToken,
        }),
    ...options,
    queryKeyHashFn: hashFn,
  } as unknown as UseQueryOptions<boolean, Error>);
}

/**
 * Suspense variant of {@link useConfidentialIsApproved}.
 * Suspends rendering until the approval check resolves.
 *
 * @param config - Token address and spender to check.
 * @returns Suspense query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: isApproved } = useConfidentialIsApprovedSuspense({
 *   tokenAddress: "0xToken",
 *   spender: "0xSpender",
 * });
 * ```
 */
export function useConfidentialIsApprovedSuspense(config: UseConfidentialIsApprovedSuspenseConfig) {
  const { spender, ...tokenConfig } = config;
  const token = useToken(tokenConfig);
  const addressQuery = useSuspenseQuery({
    ...signerAddressQueryOptions(token.signer, token.address),
    queryKeyHashFn: hashFn,
  });
  const owner = addressQuery.data as Address;

  return useSuspenseQuery({
    ...confidentialIsApprovedQueryOptions(token.signer, token.address, { owner, spender }),
    queryKeyHashFn: hashFn,
  });
}
