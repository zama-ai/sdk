"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { confidentialBalanceQueryOptions } from "@zama-fhe/sdk/query";
import { useToken } from "../token/use-token";
import { useQuery } from "../utils/query";
import { useWalletAccount } from "../utils/wallet-account";

export interface UseConfidentialBalanceConfig {
  /** Address of the confidential token contract. */
  address: Address;
  /** Account to fetch balance for. The query is disabled while `undefined`. */
  account: Address | undefined;
}

export interface UseConfidentialBalanceOptions extends Omit<
  UseQueryOptions<bigint>,
  "queryKey" | "queryFn" | "enabled"
> {
  /** Set this to `false` to disable this query from automatically running. */
  enabled?: boolean;
}

/**
 * Hook for fetching a confidential token balance. Reads the on-chain encrypted
 * value and decrypts via the SDK; cached clear values are returned instantly
 * and the relayer is only hit when the encrypted value changes.
 *
 * @example
 * ```tsx
 * const { data: balance } = useConfidentialBalance({
 *   address: "0xToken",
 *   account: "0xAccount",
 * });
 * ```
 */
export function useConfidentialBalance(
  config: UseConfidentialBalanceConfig,
  options?: UseConfidentialBalanceOptions,
) {
  const { address, account } = config;
  const { enabled = true } = options ?? {};
  const token = useToken(address);
  const walletAccount = useWalletAccount(token.sdk);

  const baseOptions = confidentialBalanceQueryOptions(
    token,
    {
      tokenAddress: address,
      account,
    },
    { walletAccount },
  );

  return useQuery<bigint>({
    ...baseOptions,
    ...options,
    enabled: Boolean(baseOptions.enabled) && enabled,
  });
}
