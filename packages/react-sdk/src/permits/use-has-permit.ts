"use client";

import { useQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { hasPermitQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useWalletAccount } from "../utils/wallet-account";

/** Configuration for {@link useHasPermit}. */
export interface UseHasPermitConfig {
  /** Contract addresses to check credentials against. */
  contractAddresses: Address[];
}

/**
 * Check whether stored permits cover the given contract addresses for the
 * connected signer.
 *
 * @param config - Contract addresses to check credentials against. The query is
 *   disabled while the list is empty or no signer is configured.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns Query result with `data: boolean`.
 *
 * @example
 * ```tsx
 * const { data: hasPermit } = useHasPermit({ contractAddresses: ["0xToken"] });
 * ```
 */
export function useHasPermit(
  config: UseHasPermitConfig,
  options?: Omit<UseQueryOptions<boolean>, "queryKey" | "queryFn">,
) {
  const sdk = useZamaSDK();
  const walletAccount = useWalletAccount(sdk);
  const baseOpts = hasPermitQueryOptions(sdk, config, { walletAccount });

  return useQuery<boolean>({
    ...baseOpts,
    ...options,
    enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true),
  });
}
