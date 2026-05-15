"use client";

import { useQuery } from "../utils/query";
import type { Address } from "@zama-fhe/sdk";
import { hasPermitQueryOptions } from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useWalletAccount } from "../utils/wallet-account";

/** Configuration for {@link useHasPermit}. */
export interface UseHasPermitConfig {
  /** Contract addresses to check credentials against (at least one required). */
  contractAddresses: [Address, ...Address[]];
}

/**
 * Check whether stored permits cover the given contract addresses for the
 * connected signer. Returns `true` if decrypt operations can proceed without
 * a wallet prompt.
 *
 * @returns Query result with `data: boolean` — `true` if a stored permit covers
 *   every entry in `contractAddresses`. The query auto-disables when no signer is configured
 *   (`data` stays `undefined`, `status` stays `"pending"`).
 * @throws {@link SignerNotConfiguredError} if the query runs without a signer configured
 *   (the `enabled` guard normally prevents this; only reachable if the caller forces `query: { enabled: true }`).
 *
 * @example
 * ```tsx
 * const { data: allowed } = useHasPermit({ contractAddresses: ["0xToken"] });
 * ```
 */
export function useHasPermit(config: UseHasPermitConfig) {
  const sdk = useZamaSDK();
  const walletAccount = useWalletAccount(sdk);
  return useQuery<boolean>(hasPermitQueryOptions(sdk, config, { walletAccount }));
}
