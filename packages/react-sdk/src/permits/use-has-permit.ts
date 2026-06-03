"use client";

import { useQuery } from "../utils/query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { hasPermitQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useWalletAccount } from "../utils/wallet-account";

/** Configuration for {@link useHasPermit}. */
export interface UseHasPermitConfig {
  /**
   * Contract addresses to check credentials against. An empty list disables the
   * query (it is a no-op rather than a type or runtime error).
   */
  contractAddresses: Address[];
}

/**
 * Check whether stored permits cover the given contract addresses for the
 * connected signer. Returns `true` if decrypt operations can proceed without
 * a wallet prompt.
 *
 * @param config - Contract addresses to check credentials against.
 * @param options - React Query options (forwarded to `useQuery`). Pass
 *   `{ enabled: false }` to mount the hook in an idle state — it performs no
 *   work and triggers no signature while disabled.
 * @returns Query result with `data: boolean` — `true` if a stored permit covers
 *   every entry in `contractAddresses`. The query auto-disables when no signer is
 *   configured, when `contractAddresses` is empty, or when `options.enabled` is
 *   `false` (`data` stays `undefined`, `status` stays `"pending"`).
 * @remarks The internal signer/empty-list guard is combined with `options.enabled`
 *   via `&&`, so it always wins: passing `enabled: true` cannot re-enable the query
 *   while no signer is configured or `contractAddresses` is empty.
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
