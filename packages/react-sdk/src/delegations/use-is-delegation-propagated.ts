"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { isDelegationPropagatedQueryOptions } from "@zama-fhe/sdk/query";
import type { EncryptedInput } from "@zama-fhe/sdk/query/user-decrypt";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";
import { useWalletAccount } from "../utils/wallet-account";

export interface UseIsDelegationPropagatedConfig {
  /** Encrypted values to probe, each paired with its contract address. */
  encryptedInputs: EncryptedInput[];
  /** The address that granted delegation rights to the connected wallet. */
  delegatorAddress?: Address;
}

/**
 * Query whether a delegation has propagated to the gateway and is usable for
 * delegated decryption. The delegate is the connected wallet. Off by default
 * (it triggers a relayer round-trip + signature) — pass `enabled: true` and a
 * `refetchInterval` to poll until `data === true`.
 *
 * @param config - Encrypted values to probe and the delegator address.
 * @param options - React Query options (forwarded to `useQuery`).
 * @returns `{ data, isLoading, error, ... }` where `data` is the boolean readiness signal.
 *
 * @example
 * ```tsx
 * const { data: ready } = useIsDelegationPropagated(
 *   { encryptedInputs: [{ encryptedValue, contractAddress }], delegatorAddress },
 *   { enabled: true, refetchInterval: 2000 },
 * );
 * ```
 */
export function useIsDelegationPropagated(
  config: UseIsDelegationPropagatedConfig,
  options?: Omit<UseQueryOptions<boolean>, "queryKey" | "queryFn">,
) {
  const sdk = useZamaSDK();
  const walletAccount = useWalletAccount(sdk);
  const queryOpts = isDelegationPropagatedQueryOptions(sdk, {
    encryptedInputs: config.encryptedInputs,
    delegatorAddress: config.delegatorAddress,
    delegateAddress: walletAccount?.address,
  });
  return useQuery<boolean>({
    ...queryOpts,
    ...options,
    enabled: queryOpts.enabled && (options?.enabled ?? false),
  });
}

/** Return type of {@link useIsDelegationPropagated}. */
export type UseIsDelegationPropagatedResult = ReturnType<typeof useIsDelegationPropagated>;
